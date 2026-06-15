import { createHash } from 'crypto';

import type { DataSource, EntityManager } from 'typeorm';
import { In } from 'typeorm';

import { config } from '@/config';
import { Genre } from '@/entities/genre';
import { Movie } from '@/entities/movie';
import { SyncState } from '@/entities/sync-state';
import { logger } from '@/logger';
import {
  moviesSoftDeletedTotal,
  moviesUpsertedTotal,
  syncDurationSeconds,
  syncRunsTotal,
} from '../metrics';
import type { MovieDetailJob, MovieSyncQueue } from '@/queue/sync-queue';

import type { TmdbClient, TmdbMovieDetails } from './tmdb-client';

const SYNC_ID = 'movies';

export interface SyncReport {
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  status: 'success' | 'partial' | 'failed';
  startedAt: Date;
  finishedAt: Date;
  cursorAt: Date;
}

interface ChunkResult {
  created: number;
  updated: number;
  failed: number;
}

export class SyncService {
  constructor(
    private readonly ds: DataSource,
    private readonly tmdb: TmdbClient,
    private readonly queue?: MovieSyncQueue,
  ) {}

  /** Хэш «значимых» полей; не учитывает поля типа popularity, чтобы не флапать. */
  static hashDetails(details: TmdbMovieDetails): string {
    const stable = {
      title: details.title ?? null,
      original_title: details.original_title ?? null,
      overview: details.overview ?? null,
      release_date: details.release_date ?? null,
      poster_path: details.poster_path ?? null,
      backdrop_path: details.backdrop_path ?? null,
      original_language: details.original_language ?? null,
      adult: details.adult ?? false,
      runtime: details.runtime ?? null,
      status: details.status ?? null,
      tagline: details.tagline ?? null,
      genres: (details.genres ?? []).map((g) => g.id).sort(),
    };
    return createHash('sha1').update(JSON.stringify(stable)).digest('hex');
  }

  /** Загрузить первичный набор фильмов из /movie/popular. */
  async initialBackfill(): Promise<void> {
    if (config.INITIAL_SYNC_PAGES <= 0) return;

    const moviesRepo = this.ds.getRepository(Movie);
    const existing = await moviesRepo.count();
    if (existing > 0) {
      logger.info({ existing }, 'Initial backfill skipped — DB already populated');
      return;
    }

    logger.info({ pages: config.INITIAL_SYNC_PAGES }, 'Initial backfill started');
    const ids: number[] = [];
    for (let page = 1; page <= config.INITIAL_SYNC_PAGES; page++) {
      const data = await this.tmdb.getPopular(page);
      ids.push(...data.results.map((r) => r.id));
      if (page >= data.total_pages) break;
    }

    const unique = Array.from(new Set(ids));
    logger.info({ count: unique.length }, 'Initial backfill: fetching details');

    if (this.queue) {
      await this.queue.addMany(unique.map<MovieDetailJob>((id) => ({ movieId: id })));
      logger.info({ count: unique.length }, 'Initial backfill enqueued');
      return;
    }

    // Если очередь не доступна — fallback на синхронный путь
    for (const id of unique) {
      try {
        await this.syncMovieById(id);
      } catch (err) {
        logger.error({ err, id }, 'Initial backfill: movie sync failed');
      }
    }
  }

  /** Получает детали одного фильма и идемпотентно пишет в БД. */
  async syncMovieById(id: number): Promise<'created' | 'updated' | 'unchanged'> {
    const details = await this.tmdb.getMovieDetails(id);
    return this.upsertMovie(details);
  }

  private async upsertMovie(
    details: TmdbMovieDetails,
  ): Promise<'created' | 'updated' | 'unchanged'> {
    const hash = SyncService.hashDetails(details);

    return this.ds.transaction(async (manager) => {
      const movieRepo = manager.getRepository(Movie);
      const genreRepo = manager.getRepository(Genre);

      // Upsert жанров
      const genres = details.genres ?? [];
      if (genres.length > 0) {
        await genreRepo
          .createQueryBuilder()
          .insert()
          .into(Genre)
          .values(genres.map((g) => ({ id: g.id, name: g.name })))
          .orUpdate(['name'], ['id'])
          .execute();
      }

      const existing = await movieRepo.findOne({
        where: { id: details.id },
        relations: { genres: true },
        withDeleted: true,
      });

      if (existing && existing.contentHash === hash && !existing.deletedAt) {
        // Ничего значимого не поменялось — обновим только «дешёвые» метрики.
        existing.popularity = details.popularity ?? existing.popularity;
        existing.voteAverage = details.vote_average ?? existing.voteAverage;
        existing.voteCount = details.vote_count ?? existing.voteCount;
        existing.sourceUpdatedAt = new Date();
        await movieRepo.save(existing);
        return 'unchanged';
      }

      const releaseDate =
        details.release_date && details.release_date.length > 0 ? details.release_date : null;
      const releaseYear = releaseDate ? Number(releaseDate.slice(0, 4)) : null;

      const wasNew = !existing;
      const entity = existing ?? movieRepo.create({ id: details.id });

      entity.title = details.title ?? entity.title ?? '';
      entity.originalTitle = details.original_title ?? null;
      entity.overview = details.overview ?? null;
      entity.releaseDate = releaseDate;
      entity.releaseYear = Number.isFinite(releaseYear) ? releaseYear : null;
      entity.popularity = details.popularity ?? 0;
      entity.voteAverage = details.vote_average ?? 0;
      entity.voteCount = details.vote_count ?? 0;
      entity.posterPath = details.poster_path ?? null;
      entity.backdropPath = details.backdrop_path ?? null;
      entity.originalLanguage = details.original_language ?? null;
      entity.adult = details.adult ?? false;
      entity.runtime = details.runtime ?? null;
      entity.status = details.status ?? null;
      entity.tagline = details.tagline ?? null;
      entity.contentHash = hash;
      entity.sourceUpdatedAt = new Date();
      entity.deletedAt = null; // «воскрешаем», если запись была soft-deleted

      entity.genres = genres.map((g) => {
        const genre = new Genre();
        genre.id = g.id;
        genre.name = g.name;
        return genre;
      });

      await movieRepo.save(entity);
      moviesUpsertedTotal.inc();
      return wasNew ? 'created' : 'updated';
    });
  }

  /** Soft delete для фильмов, отсутствующих в TMDB / помеченных как adult, которые мы не храним. */
  async softDeleteMovies(manager: EntityManager, ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await manager
      .createQueryBuilder()
      .update(Movie)
      .set({ deletedAt: () => 'now()' })
      .where('id IN (:...ids)', { ids })
      .andWhere('deleted_at IS NULL')
      .execute();
    const affected = result.affected ?? 0;
    moviesSoftDeletedTotal.inc(affected);
    return affected;
  }

  /** Основная процедура инкрементальной синхронизации. */
  async runIncrementalSync(now: Date = new Date()): Promise<SyncReport> {
    const stopTimer = syncDurationSeconds.startTimer();
    const stateRepo = this.ds.getRepository(SyncState);
    const startedAt = new Date();

    // Атомарно стартуем (защита от двойного запуска).
    const state = await stateRepo.findOneByOrFail({ id: SYNC_ID });
    if (state.status === 'running') {
      throw new Error('Sync is already running');
    }

    state.status = 'running';
    state.lastStartedAt = startedAt;
    state.lastError = null;
    state.updatedCount = 0;
    state.createdCount = 0;
    state.deletedCount = 0;
    state.failedCount = 0;
    await stateRepo.save(state);

    const cursorAt = state.cursorAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startDate = formatDateUtc(cursorAt);
    const endDate = formatDateUtc(now);

    logger.info({ startDate, endDate }, 'Incremental sync started');

    const totals = { created: 0, updated: 0, deleted: 0, failed: 0 };
    let status = 'success' as SyncReport['status'];

    try {
      // 1. Собираем все ID изменений с пагинацией.
      const changedIds = new Set<number>();
      const deletedIds = new Set<number>();

      let page = 1;
      // Защита от бесконечного цикла
      const MAX_PAGES = 500;
      while (page <= MAX_PAGES) {
        const data = await this.tmdb.getChanges({ startDate, endDate, page });
        for (const item of data.results) {
          if (item.adult === true) {
            // помечаем как «исчез» из нашей выборки (мы не храним adult)
            deletedIds.add(item.id);
          } else {
            changedIds.add(item.id);
          }
        }
        if (page >= data.total_pages) break;
        page += 1;
      }

      logger.info({ changed: changedIds.size, deletedHints: deletedIds.size }, 'Changes collected');

      // 2. Soft delete для adult-помеченных, которые у нас есть.
      if (deletedIds.size > 0) {
        const affected = await this.softDeleteMovies(this.ds.manager, Array.from(deletedIds));
        totals.deleted += affected;
      }

      // 3. Тянем детали изменившихся (через очередь — батчами).
      const ids = Array.from(changedIds);
      if (this.queue) {
        await this.queue.addMany(ids.map<MovieDetailJob>((id) => ({ movieId: id })));
        logger.info({ count: ids.length }, 'Movie detail jobs enqueued');
      } else {
        const chunks = chunk(ids, config.SYNC_BATCH_SIZE);
        for (const c of chunks) {
          const result = await this.processChunk(c);
          totals.created += result.created;
          totals.updated += result.updated;
          totals.failed += result.failed;
        }
      }

      if (totals.failed > 0) status = 'partial';
    } catch (err) {
      status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Incremental sync failed');

      const fresh = await stateRepo.findOneByOrFail({ id: SYNC_ID });
      fresh.status = 'failed';
      fresh.lastError = message;
      fresh.lastFinishedAt = new Date();
      await stateRepo.save(fresh);
      syncRunsTotal.inc({ status: 'failed' });
      stopTimer();

      throw err;
    }

    const finishedAt = new Date();
    const fresh = await stateRepo.findOneByOrFail({ id: SYNC_ID });
    fresh.status = status;
    fresh.lastFinishedAt = finishedAt;
    fresh.updatedCount = totals.updated;
    fresh.createdCount = totals.created;
    fresh.deletedCount = totals.deleted;
    fresh.failedCount = totals.failed;
    if (status !== 'failed') fresh.cursorAt = now;
    await stateRepo.save(fresh);

    syncRunsTotal.inc({ status });
    stopTimer();

    logger.info({ totals, status }, 'Incremental sync finished');

    return {
      ...totals,
      status,
      startedAt,
      finishedAt,
      cursorAt: fresh.cursorAt ?? now,
    };
  }

  private async processChunk(ids: number[]): Promise<ChunkResult> {
    const result: ChunkResult = { created: 0, updated: 0, failed: 0 };
    const settled = await Promise.allSettled(ids.map((id) => this.syncMovieById(id)));
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === 'fulfilled') {
        if (r.value === 'created') result.created += 1;
        else if (r.value === 'updated') result.updated += 1;
      } else {
        result.failed += 1;
        logger.warn({ id: ids[i], err: r.reason }, 'Movie sync failed');
      }
    }
    return result;
  }

  async getStatus(): Promise<SyncState> {
    const stateRepo = this.ds.getRepository(SyncState);
    return stateRepo.findOneByOrFail({ id: SYNC_ID });
  }

  /** Утилита для recovery — сбрасывает status='running' если процесс упал. */
  async recoverStaleRun(): Promise<void> {
    const stateRepo = this.ds.getRepository(SyncState);
    const state = await stateRepo.findOneByOrFail({ id: SYNC_ID });
    if (state.status === 'running') {
      logger.warn('Detected stale running sync — resetting state');
      state.status = 'failed';
      state.lastError = 'Process restarted while running';
      state.lastFinishedAt = new Date();
      await stateRepo.save(state);
    }
  }

  async listMovies(query: ListMoviesQuery): Promise<{ items: Movie[]; total: number }> {
    const repo = this.ds.getRepository(Movie);
    const qb = repo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.genres', 'g')
      .where('m.deleted_at IS NULL');

    if (query.year) qb.andWhere('m.release_year = :year', { year: query.year });
    if (query.genreId) {
      qb.andWhere(`m.id IN (SELECT mg.movie_id FROM movie_genres mg WHERE mg.genre_id = :gid)`, {
        gid: query.genreId,
      });
    }

    const sortField = (
      {
        popularity: 'm.popularity',
        vote_average: 'm.vote_average',
        release_date: 'm.release_date',
        title: 'm.title',
      } as const
    )[query.sortBy];

    qb.orderBy(sortField, query.sortOrder === 'asc' ? 'ASC' : 'DESC')
      .addOrderBy('m.id', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getMovieById(id: number): Promise<Movie | null> {
    const repo = this.ds.getRepository(Movie);
    return repo.findOne({ where: { id }, relations: { genres: true } });
  }
}

export interface ListMoviesQuery {
  page: number;
  pageSize: number;
  year?: number;
  genreId?: number;
  sortBy: 'popularity' | 'vote_average' | 'release_date' | 'title';
  sortOrder: 'asc' | 'desc';
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function formatDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export { In };

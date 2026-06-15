import type { DataSource } from 'typeorm';

import { Genre } from '../src/entities/Genre';
import { Movie } from '../src/entities/Movie';
import type { SyncState } from '../src/entities/sync-state';
import { SyncService } from '../src/services/sync-service';
import type { TmdbClient, TmdbMovieDetails } from '../src/services/TmdbClient';

describe('SyncService.hashDetails', () => {
  const base: TmdbMovieDetails = {
    id: 1,
    title: 'Foo',
    original_title: 'Foo',
    overview: 'bar',
    release_date: '2020-01-01',
    poster_path: '/p.jpg',
    backdrop_path: '/b.jpg',
    original_language: 'en',
    adult: false,
    runtime: 100,
    status: 'Released',
    tagline: null,
    genres: [{ id: 1, name: 'A' }],
  };

  it('produces stable hash regardless of genre order', () => {
    const h1 = SyncService.hashDetails(base);
    const h2 = SyncService.hashDetails({
      ...base,
      genres: [
        { id: 2, name: 'B' },
        { id: 1, name: 'A' },
      ],
    });
    const h3 = SyncService.hashDetails({
      ...base,
      genres: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
    });
    expect(h1).not.toBe(h2);
    expect(h2).toBe(h3);
  });

  it('ignores popularity / vote fields', () => {
    const h1 = SyncService.hashDetails(base);
    const h2 = SyncService.hashDetails({
      ...base,
      popularity: 999,
      vote_average: 9,
      vote_count: 1000,
    });
    expect(h1).toBe(h2);
  });
});

describe('SyncService.runIncrementalSync (mocked)', () => {
  it('does not advance cursor on failure', async () => {
    const tmdb = {
      getChanges: jest.fn().mockRejectedValue(new Error('boom')),
      getMovieDetails: jest.fn(),
      getPopular: jest.fn(),
      stop: jest.fn(),
    } as unknown as TmdbClient;

    const state: SyncState = {
      id: 'movies',
      status: 'idle',
      lastStartedAt: null,
      lastFinishedAt: null,
      cursorAt: new Date('2024-01-01T00:00:00Z'),
      updatedCount: 0,
      createdCount: 0,
      deletedCount: 0,
      failedCount: 0,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const stateRepo = {
      findOneByOrFail: jest.fn().mockResolvedValue(state),
      save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    };
    const ds = {
      getRepository: jest.fn().mockReturnValue(stateRepo),
      manager: {},
      transaction: jest.fn(),
    } as unknown as DataSource;

    const svc = new SyncService(ds, tmdb);
    await expect(svc.runIncrementalSync(new Date('2024-02-01T00:00:00Z'))).rejects.toThrow('boom');

    // cursor осталась прежней
    expect(state.cursorAt).toEqual(new Date('2024-01-01T00:00:00Z'));
    expect(state.status).toBe('failed');
  });
});

void Movie;
void Genre;

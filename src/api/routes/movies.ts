import { Router } from 'express';
import { z } from 'zod';

import type { SyncService } from '../../services/sync-service';
import { asyncHandler } from '../middlewares/async-handler';

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  year: z.coerce.number().int().min(1870).max(2100).optional(),
  genreId: z.coerce.number().int().positive().optional(),
  sortBy: z.enum(['popularity', 'vote_average', 'release_date', 'title']).default('popularity'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export function moviesRouter(sync: SyncService): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const q = listQuerySchema.parse(req.query);
      const { items, total } = await sync.listMovies(q);
      res.json({
        items: items.map(serializeMovie),
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.ceil(total / q.pageSize),
      });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const movie = await sync.getMovieById(id);
      if (!movie || movie.deletedAt) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }
      res.json(serializeMovie(movie));
    }),
  );

  return router;
}

function serializeMovie(m: import('../../entities/movie').Movie) {
  return {
    id: m.id,
    title: m.title,
    originalTitle: m.originalTitle,
    overview: m.overview,
    releaseDate: m.releaseDate,
    releaseYear: m.releaseYear,
    popularity: m.popularity,
    voteAverage: m.voteAverage,
    voteCount: m.voteCount,
    posterPath: m.posterPath,
    backdropPath: m.backdropPath,
    originalLanguage: m.originalLanguage,
    adult: m.adult,
    runtime: m.runtime,
    status: m.status,
    tagline: m.tagline,
    genres: (m.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
    sourceUpdatedAt: m.sourceUpdatedAt,
    updatedAt: m.updatedAt,
  };
}
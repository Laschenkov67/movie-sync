import { Router } from 'express';
import type { DataSource } from 'typeorm';

import { asyncHandler } from '../middlewares/async-handler';

export function healthRouter(ds: DataSource): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      try {
        await ds.query('SELECT 1');
        res.json({ status: 'ok', db: 'up' });
      } catch (err) {
        res.status(503).json({
          status: 'down',
          db: 'down',
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }),
  );

  return router;
}
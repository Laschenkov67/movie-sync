import { Router } from 'express';

import type { SyncService } from '../../services/sync-service';
import { asyncHandler } from '../middlewares/async-handler';

export function syncRouter(sync: SyncService): Router {
  const router = Router();

  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      const s = await sync.getStatus();
      res.json({
        status: s.status,
        lastStartedAt: s.lastStartedAt,
        lastFinishedAt: s.lastFinishedAt,
        cursorAt: s.cursorAt,
        createdCount: s.createdCount,
        updatedCount: s.updatedCount,
        deletedCount: s.deletedCount,
        failedCount: s.failedCount,
        lastError: s.lastError,
      });
    }),
  );

  return router;
}
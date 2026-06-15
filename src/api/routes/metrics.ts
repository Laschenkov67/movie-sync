import { Router } from 'express';

import { registry } from '@/metrics';
import { asyncHandler } from '@/api/middlewares/async-handler';

export function metricsRouter(): Router {
  const router = Router();
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.setHeader('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    }),
  );
  return router;
}
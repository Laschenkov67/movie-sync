import express from 'express';
import pinoHttp from 'pino-http';
import type { DataSource } from 'typeorm';

import { errorHandler, notFoundHandler } from './api/middlewares/error-handler';
import { healthRouter } from './api/routes/health';
import { metricsRouter } from './api/routes/metrics';
import { moviesRouter } from './api/routes/movies';
import { syncRouter } from './api/routes/sync';
import { logger } from './logger';
import { httpRequestDuration } from './metrics';
import type { SyncService } from './services/sync-service';

export function createApp(deps: { ds: DataSource; sync: SyncService }): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health/live' } }));

  app.use((req, res, next) => {
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
      end({
        method: req.method,
        route: req.route?.path ?? req.path,
        status: String(res.statusCode),
      });
    });
    next();
  });

  app.use('/movies', moviesRouter(deps.sync));
  app.use('/sync', syncRouter(deps.sync));
  app.use('/health', healthRouter(deps.ds));
  app.use('/metrics', metricsRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

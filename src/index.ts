import 'reflect-metadata';

import { createApp } from './app';
import { config } from './config';
import { AppDataSource } from './database/data-source';
import { logger } from './logger';
import { MovieSyncQueue } from './queue/sync-queue';
import { startMovieSyncWorker } from './queue/worker';
import { SyncScheduler } from './scheduler';
import { SyncService } from './services/sync-service';
import { TmdbClient } from './services/tmdb-client';
import { GracefulShutdown } from './utils/shutdown';

async function main(): Promise<void> {
  const shutdown = new GracefulShutdown();
  shutdown.install();

  logger.info('Initializing DataSource…');
  await AppDataSource.initialize();
  shutdown.register('datasource', () => AppDataSource.destroy());

  const tmdb = new TmdbClient();
  shutdown.register('tmdb', () => tmdb.stop());

  const queue = new MovieSyncQueue();
  shutdown.register('queue', () => queue.close());

  const syncService = new SyncService(AppDataSource, tmdb, queue);

  await syncService.recoverStaleRun();

  const worker = startMovieSyncWorker(syncService, 5);
  shutdown.register('worker', async () => {
    await worker.close();
  });

  void syncService
    .initialBackfill()
    .catch((err) => logger.error({ err }, 'Initial backfill error'));

  const scheduler = new SyncScheduler(syncService);
  scheduler.start();
  shutdown.register('scheduler', () => scheduler.stop());

  const app = createApp({ ds: AppDataSource, sync: syncService });
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'HTTP server listening');
  });

  shutdown.register(
    'http',
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});

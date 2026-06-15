import { Worker } from 'bullmq';

import { logger } from '../logger';
import { queueJobsTotal } from '../metrics';
import type { SyncService } from '../services/SyncService';

import { createRedisConnection } from './connection';
import type { MOVIE_SYNC_QUEUE, MovieDetailJob } from './sync-queue';

export function startMovieSyncWorker(syncService: SyncService, concurrency = 5): Worker {
  const connection = createRedisConnection();

  const worker = new Worker<MovieDetailJob>(
    MOVIE_SYNC_QUEUE,
    async (job) => {
      const { movieId } = job.data;
      try {
        const res = await syncService.syncMovieById(movieId);
        queueJobsTotal.inc({ status: 'ok' });
        return res;
      } catch (err) {
        queueJobsTotal.inc({ status: 'failed' });
        throw err;
      }
    },
    { connection, concurrency },
  );

  worker.on('completed', (job, result: unknown) => {
    logger.debug({ id: job.id, result }, 'Movie sync job completed');
  });
  worker.on('failed', (job, err) => {
    logger.warn({ id: job?.id, err: err.message }, 'Movie sync job failed (worker)');
  });
  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  return worker;
}

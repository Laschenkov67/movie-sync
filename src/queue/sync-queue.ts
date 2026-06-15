import { Queue, QueueEvents } from 'bullmq';

import { logger } from '../logger';

import { createRedisConnection } from './connection';

export const MOVIE_SYNC_QUEUE = 'movie-sync';

export interface MovieDetailJob {
  movieId: number;
}

export class MovieSyncQueue {
  readonly queue: Queue<MovieDetailJob>;
  private readonly events: QueueEvents;
  private readonly connection = createRedisConnection();
  private readonly eventsConnection = createRedisConnection();

  constructor() {
    this.queue = new Queue<MovieDetailJob>(MOVIE_SYNC_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600 },
      },
    });
    this.events = new QueueEvents(MOVIE_SYNC_QUEUE, { connection: this.eventsConnection });
    this.events.on('failed', ({ jobId, failedReason }) => {
      logger.warn({ jobId, failedReason }, 'Movie sync job failed');
    });
  }

  async addMany(jobs: MovieDetailJob[]): Promise<void> {
    if (jobs.length === 0) return;
    await this.queue.addBulk(
      jobs.map((data) => ({
        name: 'sync-movie',
        data,
        opts: { jobId: `movie:${data.movieId}` },
      })),
    );
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.events.close();
    await this.connection.quit();
    await this.eventsConnection.quit();
  }
}

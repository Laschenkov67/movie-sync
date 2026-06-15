import cron from 'node-cron';

import type { SyncService } from '../services/sync-service';
import { config } from '../config';
import { logger } from '../logger';

export class SyncScheduler {
  private task: cron.ScheduledTask | null = null;
  private running = false;

  constructor(private readonly sync: SyncService) {}

  start(): void {
    if (!config.SYNC_ENABLED) {
      logger.warn('Sync scheduler disabled by config');
      return;
    }
    if (!cron.validate(config.SYNC_CRON)) {
      throw new Error(`Invalid SYNC_CRON expression: ${config.SYNC_CRON}`);
    }

    this.task = cron.schedule(config.SYNC_CRON, () => {
      void this.tick();
    });
    logger.info({ cron: config.SYNC_CRON }, 'Sync scheduler started');
  }

  private async tick(): Promise<void> {
    if (this.running) {
      logger.warn('Previous sync still running, skipping this tick');
      return;
    }
    this.running = true;
    try {
      await this.sync.runIncrementalSync();
    } catch (err) {
      logger.error({ err }, 'Scheduled sync failed');
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('Sync scheduler stopped');
    }
  }
}

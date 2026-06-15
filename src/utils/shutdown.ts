import { logger } from '../logger';

export type ShutdownHook = () => Promise<void> | void;

export class GracefulShutdown {
  private hooks: { name: string; fn: ShutdownHook }[] = [];
  private shuttingDown = false;

  register(name: string, fn: ShutdownHook): void {
    this.hooks.push({ name, fn });
  }

  install(): void {
    const handler = (signal: string) => {
      void this.run(signal);
    };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
    process.on('uncaughtException', (err) => {
      logger.fatal({ err }, 'Uncaught exception');
      void this.run('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection');
      void this.run('unhandledRejection');
    });
  }

  private async run(reason: string): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    logger.info({ reason }, 'Graceful shutdown initiated');

    const timeoutMs = 15_000;
    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs);
    timer.unref();

    // Хуки в обратном порядке регистрации
    for (const hook of [...this.hooks].reverse()) {
      try {
        logger.info({ hook: hook.name }, 'Running shutdown hook');
        await hook.fn();
      } catch (err) {
        logger.error({ err, hook: hook.name }, 'Shutdown hook failed');
      }
    }

    clearTimeout(timer);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  }
}
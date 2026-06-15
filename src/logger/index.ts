import pino from 'pino';

import { config } from '@/config';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'movie-sync' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
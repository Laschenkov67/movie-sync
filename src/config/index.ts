import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default('movies'),
  DB_PASSWORD: z.string().default('movies'),
  DB_NAME: z.string().default('movies'),
  DB_LOGGING: z.coerce.boolean().default(false),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  TMDB_API_KEY: z.string().min(1, 'TMDB_API_KEY is required'),
  TMDB_BASE_URL: z.string().url().default('https://api.themoviedb.org/3'),
  TMDB_RATE_LIMIT_RPS: z.coerce.number().int().positive().default(40),
  TMDB_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  INITIAL_SYNC_PAGES: z.coerce.number().int().nonnegative().default(5),
  SYNC_CRON: z.string().default('*/15 * * * *'),
  SYNC_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  SYNC_ENABLED: z.coerce.boolean().default(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type AppConfig = typeof config;
import 'reflect-metadata';
import path from 'path';

import { DataSource } from 'typeorm';

import { config } from '../config';
import { Genre } from '../entities/genre';
import { Movie } from '../entities/movie';
import { SyncState } from '../entities/sync-state';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.DB_HOST,
  port: config.DB_PORT,
  username: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  synchronize: false,
  logging: config.DB_LOGGING,
  entities: [Movie, Genre, SyncState],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsRun: false,
  poolSize: 10,
});
import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const syncRunsTotal = new client.Counter({
  name: 'sync_runs_total',
  help: 'Total number of sync runs',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const syncDurationSeconds = new client.Histogram({
  name: 'sync_duration_seconds',
  help: 'Duration of sync runs in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [registry],
});

export const moviesUpsertedTotal = new client.Counter({
  name: 'movies_upserted_total',
  help: 'Total number of movies upserted',
  registers: [registry],
});

export const moviesSoftDeletedTotal = new client.Counter({
  name: 'movies_soft_deleted_total',
  help: 'Total number of movies soft-deleted',
  registers: [registry],
});

export const tmdbRequestsTotal = new client.Counter({
  name: 'tmdb_requests_total',
  help: 'TMDB outbound HTTP requests',
  labelNames: ['endpoint', 'status'] as const,
  registers: [registry],
});

export const queueJobsTotal = new client.Counter({
  name: 'queue_jobs_total',
  help: 'Queue jobs processed',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});
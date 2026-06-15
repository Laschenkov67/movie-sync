import type { AxiosInstance, AxiosResponse } from 'axios';
import axios from 'axios';
import axiosRetry from 'axios-retry';

import { config } from '../config';
import { logger } from '../logger';
import { tmdbRequestsTotal } from '../metrics';

import { RateLimiter } from './rate-limiter';

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbMovieListItem {
  id: number;
  title: string;
  popularity: number;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title?: string | null;
  overview?: string | null;
  release_date?: string | null;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  original_language?: string | null;
  adult?: boolean;
  runtime?: number | null;
  status?: string | null;
  tagline?: string | null;
  genres?: TmdbGenre[];
}

export interface TmdbChangesItem {
  id: number;
  adult?: boolean | null;
}

export interface TmdbPagedResponse<T> {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
}

export class TmdbError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TmdbError';
  }
}

export class TmdbClient {
  private readonly http: AxiosInstance;
  private readonly limiter: RateLimiter;

  constructor(rateLimiter?: RateLimiter) {
    this.limiter = rateLimiter ?? new RateLimiter(config.TMDB_RATE_LIMIT_RPS);

    this.http = axios.create({
      baseURL: config.TMDB_BASE_URL,
      timeout: config.TMDB_REQUEST_TIMEOUT_MS,
      params: { api_key: config.TMDB_API_KEY },
      headers: { Accept: 'application/json' },
    });

    axiosRetry(this.http, {
      retries: 5,
      retryDelay: (retryCount, error) => {
        const retryAfter = Number(error.response?.headers?.['retry-after']);
        if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
        const base = Math.min(2 ** retryCount * 500, 10_000);
        return base + Math.floor(Math.random() * 250);
      },
      retryCondition: (err) => {
        const status = err.response?.status;
        if (status === 429) return true;
        if (status && status >= 500 && status < 600) return true;
        return axiosRetry.isNetworkOrIdempotentRequestError(err);
      },
      onRetry: (count, err, requestConfig) => {
        logger.warn({ count, url: requestConfig.url, status: err.response?.status }, 'TMDB retry');
      },
    });
  }

  stop(): void {
    this.limiter.stop();
  }

  private async request<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
    await this.limiter.acquire();
    let response: AxiosResponse<T> | undefined;
    try {
      response = await this.http.get<T>(endpoint, { params });
      tmdbRequestsTotal.inc({ endpoint, status: String(response.status) });
      return response.data;
    } catch (err) {
      const status =
        axios.isAxiosError(err) && err.response ? err.response.status : 'network_error';
      tmdbRequestsTotal.inc({ endpoint, status: String(status) });
      if (axios.isAxiosError(err)) {
        throw new TmdbError(
          `TMDB request failed: ${endpoint} (${String(status)})`,
          err.response?.status,
          err,
        );
      }
      throw new TmdbError(`TMDB request failed: ${endpoint}`, undefined, err);
    }
  }

  getPopular(page: number): Promise<TmdbPagedResponse<TmdbMovieListItem>> {
    return this.request<TmdbPagedResponse<TmdbMovieListItem>>('/movie/popular', { page });
  }

  getMovieDetails(id: number): Promise<TmdbMovieDetails> {
    return this.request<TmdbMovieDetails>(`/movie/${id}`);
  }

  /**
   * /movie/changes принимает start_date/end_date в формате YYYY-MM-DD (UTC).
   * Возвращает страницу id-шек изменившихся фильмов.
   */
  getChanges(params: {
    startDate?: string;
    endDate?: string;
    page?: number;
  }): Promise<TmdbPagedResponse<TmdbChangesItem>> {
    const query: Record<string, unknown> = { page: params.page ?? 1 };
    if (params.startDate) query.start_date = params.startDate;
    if (params.endDate) query.end_date = params.endDate;
    return this.request<TmdbPagedResponse<TmdbChangesItem>>('/movie/changes', query);
  }
}

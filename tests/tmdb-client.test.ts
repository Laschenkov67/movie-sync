import nock from 'nock';

import { TmdbClient } from '../src/services/tmdb-client';

describe('TmdbClient', () => {
  afterEach(() => nock.cleanAll());

  it('fetches popular movies', async () => {
    nock('https://api.themoviedb.org')
      .get('/3/movie/popular')
      .query(true)
      .reply(200, { page: 1, total_pages: 1, total_results: 1, results: [{ id: 1, title: 't' }] });

    const client = new TmdbClient();
    const r = await client.getPopular(1);
    expect(r.results[0].id).toBe(1);
    client.stop();
  });

  it('retries on 429', async () => {
    nock('https://api.themoviedb.org')
      .get('/3/movie/popular')
      .query(true)
      .reply(429, '', { 'retry-after': '0' })
      .get('/3/movie/popular')
      .query(true)
      .reply(200, { page: 1, total_pages: 1, total_results: 0, results: [] });

    const client = new TmdbClient();
    const r = await client.getPopular(1);
    expect(r.results).toEqual([]);
    client.stop();
  });
});
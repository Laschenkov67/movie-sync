import { RateLimiter } from '@/services/rate-limiter';

describe('RateLimiter', () => {
  it('limits throughput to the configured rps', async () => {
    const rps = 10;
    const limiter = new RateLimiter(rps);
    const start = Date.now();
    const N = 20;
    await Promise.all(
      Array.from({ length: N }, async () => {
        await limiter.acquire();
      }),
    );
    const elapsed = Date.now() - start;
    limiter.stop();
    expect(elapsed).toBeGreaterThanOrEqual(800);
  });
});

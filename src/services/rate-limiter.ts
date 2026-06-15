/**
 * Простая token-bucket реализация поверх Promise-очереди.
 * Поддерживает максимум N запросов в секунду; лишние ждут.
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private tokens: number;
  private readonly capacity: number;
  private readonly refillIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(rps: number) {
    if (rps <= 0) throw new Error('rps must be > 0');
    this.capacity = rps;
    this.tokens = rps;
    this.refillIntervalMs = 1000 / rps;
    this.start();
  }

  private start(): void {
    this.timer = setInterval(() => {
      if (this.tokens < this.capacity) this.tokens += 1;
      this.drain();
    }, this.refillIntervalMs);
    this.timer.unref?.();
  }

  private drain(): void {
    while (this.tokens > 0 && this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve) {
        this.tokens -= 1;
        resolve();
      }
    }
  }

  async acquire(): Promise<void> {
    if (this.tokens > 0) {
      this.tokens -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
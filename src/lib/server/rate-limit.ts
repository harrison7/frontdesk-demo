/**
 * Fixed-window rate limiter kept in process memory.
 *
 * WHY: the chat endpoint is public and, with a real provider, every request
 * costs money. This stops casual abuse of a single demo server. It is not
 * shared between instances and resets on restart; a multi-instance deployment
 * would need a shared store such as Redis or Postgres.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit for `key` and returns whether it is within the limit. */
  allow(key: string): boolean {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      this.prune(t);
      return true;
    }
    w.count++;
    return w.count <= this.limit;
  }

  /** Drop expired windows so the map cannot grow without bound. */
  private prune(t: number) {
    if (this.windows.size < 10_000) return;
    for (const [key, w] of this.windows) {
      if (t - w.start >= this.windowMs) this.windows.delete(key);
    }
  }
}

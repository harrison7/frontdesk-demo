import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/lib/server/rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit per window, per key, then resets", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);
    now = 1000;
    expect(limiter.allow("a")).toBe(true);
  });
});

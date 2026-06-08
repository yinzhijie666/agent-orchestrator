import { describe, test, expect } from "bun:test";
import { RateLimiter } from "../server/lib/rate-limiter.js";

describe("RateLimiter", () => {
  test("allows requests under the limit", () => {
    const rl = new RateLimiter({ maxRequests: 5, windowMs: 60000 });
    for (let i = 0; i < 5; i++) {
      const result = rl.check("client-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  test("blocks requests over the limit", () => {
    const rl = new RateLimiter({ maxRequests: 3, windowMs: 60000 });
    for (let i = 0; i < 3; i++) rl.check("client-2");
    const result = rl.check("client-2");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test("tracks different clients independently", () => {
    const rl = new RateLimiter({ maxRequests: 2, windowMs: 60000 });
    expect(rl.check("alice").allowed).toBe(true);
    expect(rl.check("alice").allowed).toBe(true);
    expect(rl.check("alice").allowed).toBe(false);
    const bobResult = rl.check("bob");
    expect(bobResult.allowed).toBe(true);
    expect(bobResult.remaining).toBe(1);
  });

  test("resets after window expires", async () => {
    const rl = new RateLimiter({ maxRequests: 1, windowMs: 50 });
    expect(rl.check("client-3").allowed).toBe(true);
    expect(rl.check("client-3").allowed).toBe(false);
    await new Promise(r => setTimeout(r, 60));
    expect(rl.check("client-3").allowed).toBe(true);
  });
});

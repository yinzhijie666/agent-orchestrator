import { describe, test, expect } from "bun:test";
import { CircuitBreaker } from "../server/lib/circuit-breaker.js";

describe("CircuitBreaker", () => {
  test("starts in CLOSED state", () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 3 });
    expect(cb.state).toBe("CLOSED");
  });

  test("transitions to OPEN after consecutive failures", () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 2, resetTimeoutMs: 60000 });
    expect(cb.state).toBe("CLOSED");
    cb.recordFailure();
    expect(cb.state).toBe("CLOSED");
    cb.recordFailure();
    expect(cb.state).toBe("OPEN");
  });

  test("does not call action when OPEN", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 1, resetTimeoutMs: 60000 });
    cb.recordFailure();
    expect(cb.state).toBe("OPEN");
    let called = false;
    const result = await cb.call(async () => { called = true; return "ok"; });
    expect(called).toBe(false);
    expect(result).toBeNull();
  });

  test("allows calls after reset timeout (HALF_OPEN)", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 1, resetTimeoutMs: 50 });
    cb.recordFailure();
    expect(cb.state).toBe("OPEN");
    await new Promise(r => setTimeout(r, 60));
    expect(cb.state).toBe("HALF_OPEN");
  });

  test("closes after successful call in HALF_OPEN", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 2, resetTimeoutMs: 50 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe("OPEN");
    await new Promise(r => setTimeout(r, 60));
    expect(cb.state).toBe("HALF_OPEN");
    await cb.call(async () => "success");
    expect(cb.state).toBe("CLOSED");
  });

  test("opens again after failure in HALF_OPEN", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 2, resetTimeoutMs: 50 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe("OPEN");
    await new Promise(r => setTimeout(r, 60));
    expect(cb.state).toBe("HALF_OPEN");
    try {
      await cb.call(async () => { throw new Error("still failing"); });
    } catch (e) {}
    expect(cb.state).toBe("OPEN");
  });

  test("records consecutive failures", () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 3 });
    expect(cb.failureCount).toBe(0);
    cb.recordFailure();
    expect(cb.failureCount).toBe(1);
  });

  test("records success resets failure count", () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 3 });
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.failureCount).toBe(0);
  });
});

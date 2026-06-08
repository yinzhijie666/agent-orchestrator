import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createHealthCheck } from "../server/lib/health.js";

describe("HealthCheck", () => {
  test("liveness returns ok", () => {
    const hc = createHealthCheck({});
    const result = hc.liveness();
    expect(result.status).toBe("ok");
    expect(typeof result.uptime).toBe("number");
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  test("readiness reports db status", () => {
    const hc = createHealthCheck({ dbOk: true });
    const result = hc.readiness();
    expect(result.status).toBe("ok");
    expect(result.database).toBe("connected");
    expect(typeof result.uptime).toBe("number");
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  test("readiness reports db failure", () => {
    const hc = createHealthCheck({ dbOk: false });
    const result = hc.readiness();
    expect(result.status).toBe("degraded");
    expect(result.database).toBe("error");
  });
});

import { describe, test, expect, beforeEach } from "bun:test";
import { authenticate } from "../server/lib/auth.js";

describe("authenticate", () => {
  const origKey = process.env.AGENT_ORCHESTRATOR_API_KEY;

  beforeEach(() => {
    if (origKey) process.env.AGENT_ORCHESTRATOR_API_KEY = origKey;
    else delete process.env.AGENT_ORCHESTRATOR_API_KEY;
  });

  test("returns null when no API key configured (dev mode)", () => {
    delete process.env.AGENT_ORCHESTRATOR_API_KEY;
    const req = new Request("http://localhost/api/plans");
    expect(authenticate(req)).toBeNull();
  });

  test("returns 401 when API key required but missing", () => {
    process.env.AGENT_ORCHESTRATOR_API_KEY = "test-key";
    const req = new Request("http://localhost/api/plans");
    const result = authenticate(req);
    expect(result).not.toBeNull();
    expect(result.status).toBe(401);
  });

  test("returns 401 when Bearer token is wrong", () => {
    process.env.AGENT_ORCHESTRATOR_API_KEY = "test-key";
    const req = new Request("http://localhost/api/plans", {
      headers: { Authorization: "Bearer wrong-key" },
    });
    const result = authenticate(req);
    expect(result.status).toBe(401);
  });

  test("returns null when valid Bearer token", () => {
    process.env.AGENT_ORCHESTRATOR_API_KEY = "test-key";
    const req = new Request("http://localhost/api/plans", {
      headers: { Authorization: "Bearer test-key" },
    });
    expect(authenticate(req)).toBeNull();
  });

  test("returns null for valid token without Bearer prefix", () => {
    process.env.AGENT_ORCHESTRATOR_API_KEY = "test-key";
    const req = new Request("http://localhost/api/plans", {
      headers: { Authorization: "test-key" },
    });
    expect(authenticate(req)).toBeNull();
  });
});

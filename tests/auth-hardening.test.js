import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { authenticate, ALLOWED_ORIGINS } from "../server/lib/auth.js";

describe("auth hardening", () => {
  const origKey = process.env.AGENT_ORCHESTRATOR_API_KEY;
  const origOrigins = process.env.CORS_ORIGIN;

  beforeEach(() => {
    process.env.AGENT_ORCHESTRATOR_API_KEY = "test-key";
    process.env.CORS_ORIGIN = "http://example.com";
  });

  afterEach(() => {
    if (origKey) process.env.AGENT_ORCHESTRATOR_API_KEY = origKey;
    else delete process.env.AGENT_ORCHESTRATOR_API_KEY;
    if (origOrigins) process.env.CORS_ORIGIN = origOrigins;
    else delete process.env.CORS_ORIGIN;
  });

  // Auth hardening
  test("rejects token with different length to prevent timing oracle", () => {
    process.env.AGENT_ORCHESTRATOR_API_KEY = "long-key-abcdef";
    const req = new Request("http://localhost/api/plans", {
      headers: { Authorization: "short" },
    });
    const result = authenticate(req);
    expect(result.status).toBe(401);
  });

  test("supports multiple API keys via comma-separated env", () => {
    process.env.AGENT_ORCHESTRATOR_API_KEY = "key-one,key-two,key-three";
    let req = new Request("http://localhost/api/plans", {
      headers: { Authorization: "key-two" },
    });
    expect(authenticate(req)).toBeNull();

    req = new Request("http://localhost/api/plans", {
      headers: { Authorization: "key-three" },
    });
    expect(authenticate(req)).toBeNull();

    req = new Request("http://localhost/api/plans", {
      headers: { Authorization: "wrong" },
    });
    expect(authenticate(req).status).toBe(401);
  });

  // CORS hardening
  test("allows requests from configured origin", () => {
    process.env.CORS_ORIGIN = "https://app.example.com";
    const origins = ALLOWED_ORIGINS();
    expect(origins).toContain("https://app.example.com");
  });

  test("falls back to * when CORS_ORIGIN is not set", () => {
    delete process.env.CORS_ORIGIN;
    const origins = ALLOWED_ORIGINS();
    expect(origins).toContain("*");
  });

  test("allows multiple origins separated by comma", () => {
    process.env.CORS_ORIGIN = "https://a.com,https://b.com";
    const origins = ALLOWED_ORIGINS();
    expect(origins).toContain("https://a.com");
    expect(origins).toContain("https://b.com");
    expect(origins).toHaveLength(2);
  });
});

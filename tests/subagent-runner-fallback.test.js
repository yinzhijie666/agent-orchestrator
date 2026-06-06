import { describe, test, expect } from "bun:test";
import { SubagentRunner } from "../server/lib/subagent-runner.js";
import BaseModelClient from "../server/lib/model-clients/base-client.js";

const cfg = {
  models: {
    deepseek: { api_key_env: "DEEPSEEK_API_KEY", base_url: "x", model: "deepseek-v4" },
    "opencode-zen": { api_key_env: "OPENCODE_API_KEY", base_url: "x", model: "deepseek-v4-flash-free" },
  },
  auto_exec: { model: "cheap", timeout_ms: 5000 },
};

describe("SubagentRunner fallback chain (PR2: Stage 4.1)", () => {
  test("cheap (OpenCode Zen) with primary failure falls back to DeepSeek", async () => {
    const r = new SubagentRunner(cfg);
    const calls = [];
    const primaryClient = {
      model: "deepseek-v4-flash-free",
      provider: "opencode-zen",
      chatWithFallback: async (_msgs, _opts, fallbackClient) => {
        calls.push("primary");
        if (!fallbackClient) {
          const err = new Error("ECONNREFUSED");
          err.status = 500;
          throw err;
        }
        return {
          content: '{"status":"success","executed_skills":[],"p0_failures":[],"summary":"fb-ok"}',
          _model: "deepseek-v4",
          _provider: "deepseek",
          _fallback: true,
        };
      },
    };

    const out = await r.run("p", { client: primaryClient, timeoutMs: 2000 });
    expect(calls).toContain("primary");
    expect(out.model).toBe("deepseek-v4");
    expect(out.fallback).toBe(true);
    expect(out.status).toBe("success");
  });

  test("non-MiniMax primary does not get auto-fallback", async () => {
    const r = new SubagentRunner(cfg);
    let receivedFallback = null;
    const dsClient = {
      model: "deepseek-v4",
      provider: "deepseek",
      chatWithFallback: async (_msgs, _opts, fallbackClient) => {
        receivedFallback = fallbackClient;
        return {
          content: '{"status":"success","executed_skills":[],"p0_failures":[],"summary":"ok"}',
          _model: "deepseek-v4",
          _provider: "deepseek",
          _fallback: false,
        };
      },
    };

    await r.run("p", { client: dsClient, timeoutMs: 2000 });
    expect(receivedFallback).toBeNull();
  });

  test("explicit fallbackClient option overrides auto-detection", async () => {
    const r = new SubagentRunner(cfg);
    let receivedFallback = null;
    const mmClient = {
      model: "deepseek-v4-flash-free",
      provider: "opencode-zen",
      chatWithFallback: async (_msgs, _opts, fallbackClient) => {
        receivedFallback = fallbackClient;
        return {
          content: '{"status":"success","executed_skills":[],"p0_failures":[],"summary":"ok"}',
          _model: "deepseek-v4-flash-free",
          _provider: "opencode-zen",
          _fallback: false,
        };
      },
    };
    const explicitFallback = { model: "explicit" };
    await r.run("p", { client: mmClient, timeoutMs: 2000, fallbackClient: explicitFallback });
    expect(receivedFallback).toBe(explicitFallback);
  });
});

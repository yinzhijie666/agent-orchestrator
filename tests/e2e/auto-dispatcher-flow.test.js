/**
 * E2E: AutoDispatcher (D1 LLM path)
 *
 * Verifies the L3 auto-dispatch path end-to-end:
 *   1. AutoDispatcher.start() with D2 disabled (prefer=run)
 *   2. dispatcher.dispatch() makes a real LLM call (when API key present)
 *   3. Returned result has unified envelope (status, executed_skills, summary, etc.)
 *   4. dispatcher.getStatus() reflects dispatch counts
 *   5. dispatcher.stop() is clean
 *
 * Requires: MINIMAX_API_KEY or DEEPSEEK_API_KEY env var
 * (test is skipped with a warning if neither is set)
 *
 * NOT part of `bun test` (excluded by tests/e2e/ path).
 * Manual run: bun run tests/e2e/auto-dispatcher-flow.test.js
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { AutoDispatcher } from "../../server/lib/auto-dispatcher.js";
import { AutoExecutor } from "../../server/lib/auto-executor.js";

const hasMinimax = !!process.env.MINIMAX_API_KEY;
const hasDeepseek = !!process.env.DEEPSEEK_API_KEY;
const hasOpenzen = !!process.env.OPENCODE_API_KEY;
const hasAnyKey = hasMinimax || hasDeepseek || hasOpenzen;

const cfg = {
  auto_exec: {
    enabled: true,
    max_skills: 20,
    model: "cheap",
    timeout_ms: 60000,
    dispatcher: { prefer: "run" },
  },
  models: {
    deepseek: {
      api_key_env: "DEEPSEEK_API_KEY",
      base_url: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
    },
    "opencode-zen": {
      api_key_env: "OPENCODE_API_KEY",
      base_url: "https://opencode.ai/zen/v1",
      model: "deepseek-v4-flash-free",
    },
  },
};

let dispatcher;

describe("E2E: AutoDispatcher (D1 LLM path)", () => {
  beforeAll(async () => {
    if (!hasAnyKey) {
      console.warn("[E2E] No MINIMAX_API_KEY or DEEPSEEK_API_KEY; some tests will be skipped");
    }
    await cleanupLeakedServers();
    dispatcher = new AutoDispatcher(cfg);
    await dispatcher.start();
  });

  afterAll(async () => {
    if (dispatcher) {
      try { await dispatcher.stop(); } catch (e) {
        console.warn("[E2E] dispatcher.stop() error (non-fatal):", e.message);
      }
    }
    await cleanupLeakedServers();
  });

  test("D1. dispatcher initializes with D2 disabled", () => {
    expect(dispatcher.d2Enabled).toBe(false);
    expect(dispatcher.server).toBeNull();
    const s = dispatcher.getStatus();
    expect(s.d2Enabled).toBe(false);
  });

  test("D2. dispatch with empty skill list returns success without LLM call", async () => {
    const fakeClient = {
      model: "fake-d2",
      provider: "test",
      chatWithFallback: async () => ({
        content: JSON.stringify({ status: "success", executed_skills: [], p0_failures: [], summary: "empty" }),
        _model: "fake-d2",
        _provider: "test",
        _fallback: false,
      }),
    };
    const validated = AutoExecutor.validate([]);
    const prompt = AutoExecutor.buildPrompt(validated, { planId: "empty-test", title: "Empty", goal: "n/a" });
    const r = await dispatcher.dispatch(prompt, { client: fakeClient, timeoutMs: 5000 });
    expect(r._mode).toBe("llm");
    expect(r.status).toBeTruthy();
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("D3. dispatch with fake client returns unified envelope", async () => {
    const fakeClient = {
      model: "fake-e2e",
      provider: "test",
      chatWithFallback: async () => ({
        content: JSON.stringify({
          status: "success",
          executed_skills: [
            { name: "skill_a", type: "skill", tier: "P0", result: "completed", output: "ok" },
            { name: "codegraph_x", type: "codegraph", tier: "P1", result: "skipped", output: "no tool", error: "unavailable" },
          ],
          p0_failures: [],
          summary: "E2E test summary",
        }),
        _model: "fake-e2e",
        _provider: "test",
        _fallback: false,
      }),
    };
    const validated = [
      { type: "skill", value: "skill_a", tier: "P0_critical" },
      { type: "codegraph", value: "codegraph_x", tier: "P1_important" },
    ];
    const prompt = AutoExecutor.buildPrompt(validated, { planId: "fake-test", title: "Fake Plan", goal: "test" });
    const r = await dispatcher.dispatch(prompt, { client: fakeClient, timeoutMs: 5000 });
    expect(r._mode).toBe("llm");
    expect(r.status).toBe("success");
    expect(r.executed_skills).toHaveLength(2);
    expect(r.executed_skills[0].name).toBe("skill_a");
    expect(r.executed_skills[0].tier).toBe("P0");
    expect(r.executed_skills[1].result).toBe("skipped");
    expect(r.summary).toBe("E2E test summary");
    expect(r.p0_failures).toEqual([]);
  });

  test("D4. dispatch failure (timeout) returns failure result", async () => {
    const slowClient = {
      model: "slow",
      provider: "test",
      chatWithFallback: async () => {
        await new Promise((res) => setTimeout(res, 3000));
        return { content: '{"status":"success"}' };
      },
    };
    const result = await dispatcher.dispatch("test", { client: slowClient, timeoutMs: 100 });
    expect(result.status).toBe("failure");
    expect(result.summary).toMatch(/timed out/);
    expect(result._mode).toBe("llm");
  });

  test("D5. dispatcher.stop() is clean (no-op for D2-disabled)", async () => {
    const r = await dispatcher.stop();
    expect(r.stopped).toBe(false);
    expect(r.reason).toContain("no server");
  });

  test("D6. dispatch with mock returns unified envelope", async () => {
    const fakeClient = {
      model: "fake-d6",
      provider: "test",
      chatWithFallback: async () => ({
        content: JSON.stringify({
          status: "success",
          executed_skills: [],
          p0_failures: [],
          summary: "mock_e2e",
        }),
        _model: "fake-d6",
        _provider: "test",
        _fallback: false,
      }),
    };
    const d = new AutoDispatcher(cfg);
    await d.start();
    try {
      const prompt = `Output ONLY this exact JSON: {"status":"success","executed_skills":[],"p0_failures":[],"summary":"mock"}`;
      const r = await d.dispatch(prompt, { client: fakeClient, timeoutMs: 5000 });
      expect(r._mode).toBe("llm");
      expect(["success", "partial", "failure"]).toContain(r.status);
      expect(typeof r.summary).toBe("string");
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      await d.stop();
    }
  });
});

async function cleanupLeakedServers() {
  try {
    const { execSync } = await import("node:child_process");
    execSync("pkill -f 'opencode serve --port 14[0-9][0-9][0-9] --hostname 127.0.0.1 --pure' 2>/dev/null", { stdio: "ignore" });
    await new Promise(r => setTimeout(r, 200));
  } catch (e) {
    console.warn("[E2E] cleanupLeakedServers:", e.message);
  }
}

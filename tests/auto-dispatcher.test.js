import { describe, test, expect, beforeEach } from "bun:test";
import { AutoDispatcher } from "../server/lib/auto-dispatcher.js";

function makeConfig(overrides = {}) {
  return {
    auto_exec: {
      enabled: true,
      model: "cheap",
      timeout_ms: 5000,
      dispatcher: {
        prefer: "auto",
        server: {
          port_range: [14196, 14197, 14198, 14199],
          startup_timeout_ms: 3000,
          use_pure: true,
        },
      },
    },
    models: {
      deepseek: { api_key_env: "DEEPSEEK_API_KEY", base_url: "x", model: "d" },
      minimax: { api_key_env: "MINIMAX_API_KEY", base_url: "x", model: "m" },
    },
    ...overrides,
  };
}

describe("AutoDispatcher", () => {
  test("constructor sets default state", () => {
    const d = new AutoDispatcher(makeConfig());
    expect(d.d2Enabled).toBe(false);
    expect(d.server).toBeNull();
    expect(d.dispatchedTotal).toBe(0);
    expect(d.dispatchedByMode).toEqual({ llm: 0, server: 0, fallback: 0 });
  });

  test("getStatus reports d2 disabled when not started", () => {
    const d = new AutoDispatcher(makeConfig());
    const s = d.getStatus();
    expect(s.d2Enabled).toBe(false);
    expect(s.d2Url).toBeNull();
    expect(s.d2Port).toBeNull();
    expect(s.d2Healthy).toBe(false);
    expect(s.dispatchedTotal).toBe(0);
  });

  test("start with prefer=run skips D2 server", async () => {
    const cfg = makeConfig();
    cfg.auto_exec.dispatcher.prefer = "run";
    const d = new AutoDispatcher(cfg);
    const r = await d.start();
    expect(r.started).toBe(false);
    expect(r.reason).toContain("not preferred");
    expect(d.d2Enabled).toBe(false);
  });

  test("start with prefer=auto attempts D2 server", async () => {
    const d = new AutoDispatcher(makeConfig());
    const r = await d.start();
    expect(["started", "failed"]).toContain(r.started ? "started" : "failed");
    if (r.started) {
      expect(d.d2Enabled).toBe(true);
      expect(d.server).not.toBeNull();
      expect(r.url).toBeTruthy();
      expect(r.port).toBeGreaterThanOrEqual(14196);
      expect(r.pid).toBeGreaterThan(0);
      await d.stop();
    } else {
      expect(r.error).toBeTruthy();
      expect(d.d2Enabled).toBe(false);
    }
  });

  test("dispatch uses D1 when D2 disabled", async () => {
    const cfg = makeConfig();
    cfg.auto_exec.dispatcher.prefer = "run";
    const d = new AutoDispatcher(cfg);
    await d.start();

    const fakeClient = {
      model: "fake",
      provider: "test",
      chatWithFallback: async () => ({
        content: JSON.stringify({ status: "success", executed_skills: [], p0_failures: [], summary: "ok" }),
        _model: "fake",
        _provider: "test",
        _fallback: false,
      }),
    };
    const r = await d.dispatch("test prompt", { client: fakeClient, timeoutMs: 2000 });
    expect(r._mode).toBe("llm");
    expect(r.status).toBe("success");
    expect(d.dispatchedByMode.llm).toBe(1);
  });

  test("dispatchResult includes _mode and dispatcher info", async () => {
    const cfg = makeConfig();
    cfg.auto_exec.dispatcher.prefer = "run";
    const d = new AutoDispatcher(cfg);
    await d.start();

    const fakeClient = {
      model: "fake",
      provider: "test",
      chatWithFallback: async () => ({
        content: '{"status":"success","executed_skills":[],"p0_failures":[],"summary":"x"}',
      }),
    };
    const r = await d.dispatch("prompt", { client: fakeClient });
    expect(r._mode).toBe("llm");
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("stop is a no-op when no server", async () => {
    const d = new AutoDispatcher(makeConfig());
    const r = await d.stop();
    expect(r.stopped).toBe(false);
    expect(r.reason).toContain("no server");
  });

  test("dispatch increments dispatchedTotal", async () => {
    const cfg = makeConfig();
    cfg.auto_exec.dispatcher.prefer = "run";
    const d = new AutoDispatcher(cfg);
    await d.start();

    const fakeClient = {
      model: "fake",
      provider: "test",
      chatWithFallback: async () => ({ content: '{"status":"success","executed_skills":[],"p0_failures":[],"summary":"x"}' }),
    };
    await d.dispatch("p1", { client: fakeClient });
    await d.dispatch("p2", { client: fakeClient });
    await d.dispatch("p3", { client: fakeClient });
    expect(d.dispatchedTotal).toBe(3);
    expect(d.getStatus().dispatchedByMode.llm).toBe(3);
  });
});

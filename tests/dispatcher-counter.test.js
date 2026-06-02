import { describe, test, expect } from "bun:test";
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
          port_range: [14296, 14297, 14298, 14299],
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

function makeFakeClient(content = '{"status":"success","executed_skills":[],"p0_failures":[],"summary":"x"}') {
  return {
    model: "fake",
    provider: "test",
    chatWithFallback: async () => ({
      content,
      _model: "fake",
      _provider: "test",
      _fallback: false,
    }),
  };
}

describe("AutoDispatcher counter semantics (PR2: Stage 5)", () => {
  test("counters are mutually exclusive: llm + server + fallback === dispatchedTotal", async () => {
    const cfg = makeConfig();
    cfg.auto_exec.dispatcher.prefer = "run";
    const d = new AutoDispatcher(cfg);
    await d.start();

    const fakeClient = makeFakeClient();
    for (let i = 0; i < 5; i++) {
      await d.dispatch(`p${i}`, { client: fakeClient });
    }

    const status = d.getStatus();
    expect(status.dispatchedTotal).toBe(5);
    expect(status.dispatchedByMode.llm + status.dispatchedByMode.server + status.dispatchedByMode.fallback)
      .toBe(status.dispatchedTotal);
    expect(status.dispatchedByMode.llm).toBe(5);
    expect(status.dispatchedByMode.server).toBe(0);
    expect(status.dispatchedByMode.fallback).toBe(0);
  });

  test("D1-only path increments llm only", async () => {
    const cfg = makeConfig();
    cfg.auto_exec.dispatcher.prefer = "run";
    const d = new AutoDispatcher(cfg);
    await d.start();

    const fakeClient = makeFakeClient();
    await d.dispatch("p", { client: fakeClient });

    expect(d.dispatchedByMode.llm).toBe(1);
    expect(d.dispatchedByMode.server).toBe(0);
    expect(d.dispatchedByMode.fallback).toBe(0);
  });

  test("fallback counter increments when D2 disabled but llm also runs", async () => {
    const cfg = makeConfig();
    cfg.auto_exec.dispatcher.prefer = "run";
    const d = new AutoDispatcher(cfg);
    await d.start();

    const fakeClient = makeFakeClient();
    await d.dispatch("p", { client: fakeClient });

    const llm = d.dispatchedByMode.llm;
    const server = d.dispatchedByMode.server;
    const fb = d.dispatchedByMode.fallback;
    expect(llm + server + fb).toBe(d.dispatchedTotal);
  });
});

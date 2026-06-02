import { describe, test, expect } from "bun:test";
import { SubagentRunner } from "../server/lib/subagent-runner.js";

const cfg = {
  models: {
    deepseek: { api_key_env: "X", base_url: "x", model: "d" },
    minimax: { api_key_env: "X", base_url: "x", model: "m" },
  },
  auto_exec: { model: "cheap", timeout_ms: 5000 },
};

describe("SubagentRunner", () => {
  test("constructor reads timeout from config", () => {
    const r = new SubagentRunner(cfg);
    expect(r.defaultTimeoutMs).toBe(5000);
  });

  test("constructor falls back to default timeout", () => {
    const r = new SubagentRunner({ models: cfg.models });
    expect(r.defaultTimeoutMs).toBe(90000);
  });

  test("parses clean JSON", () => {
    const r = new SubagentRunner(cfg);
    const out = r._parseResult('{"status":"success","executed_skills":[{"name":"a","tier":"P0","result":"completed"}],"p0_failures":[],"summary":"done"}');
    expect(out.status).toBe("success");
    expect(out.executed_skills).toHaveLength(1);
    expect(out.executed_skills[0].name).toBe("a");
    expect(out.summary).toBe("done");
  });

  test("parses markdown-fenced JSON", () => {
    const r = new SubagentRunner(cfg);
    const out = r._parseResult('```json\n{"status":"partial","executed_skills":[],"p0_failures":[],"summary":"partial"}\n```');
    expect(out.status).toBe("partial");
  });

  test("parses JSON with <think> block prefix", () => {
    const r = new SubagentRunner(cfg);
    const out = r._parseResult('<think>reasoning</think>{"status":"success","executed_skills":[],"p0_failures":[],"summary":"after-think"}');
    expect(out.status).toBe("success");
    expect(out.summary).toBe("after-think");
  });

  test("parses JSON embedded in prose", () => {
    const r = new SubagentRunner(cfg);
    const out = r._parseResult('Sure! Here is the JSON: {"status":"success","executed_skills":[],"p0_failures":[],"summary":"prose"} thanks.');
    expect(out.status).toBe("success");
    expect(out.summary).toBe("prose");
  });

  test("non-JSON content returns failure", () => {
    const r = new SubagentRunner(cfg);
    const out = r._parseResult("I cannot help with that");
    expect(out.status).toBe("failure");
    expect(out._parseError).toBeTruthy();
    expect(out._rawContent).toContain("cannot help");
  });

  test("empty content returns failure", () => {
    const r = new SubagentRunner(cfg);
    const out = r._parseResult("");
    expect(out.status).toBe("failure");
    expect(out.summary).toContain("empty");
  });

  test("null content returns failure", () => {
    const r = new SubagentRunner(cfg);
    const out = r._parseResult(null);
    expect(out.status).toBe("failure");
  });

  test("missing status field infers from p0_failures", () => {
    const r = new SubagentRunner(cfg);
    const out = r._parseResult('{"executed_skills":[],"p0_failures":["x"],"summary":"y"}');
    expect(out.status).toBe("failure");
  });

  test("missing status with no p0_failures defaults to success", () => {
    const r = new SubagentRunner(cfg);
    const out = r._parseResult('{"executed_skills":[],"summary":"y"}');
    expect(out.status).toBe("success");
  });

  test("run() returns unified envelope with D1 metadata", async () => {
    const r = new SubagentRunner(cfg);
    const fakeClient = {
      model: "fake-m",
      provider: "test",
      chatWithFallback: async () => ({
        content: '{"status":"success","executed_skills":[{"name":"s1","tier":"P0","result":"completed","output":"ok"}],"p0_failures":[],"summary":"done"}',
        _model: "fake-m",
        _provider: "test",
        _fallback: false,
      }),
    };
    const out = await r.run("test prompt", { client: fakeClient, timeoutMs: 2000 });
    expect(out.status).toBe("success");
    expect(out.mode).toBe("llm");
    expect(out.model).toBe("fake-m");
    expect(out.executed_skills).toHaveLength(1);
    expect(out.executed_skills[0].name).toBe("s1");
    expect(out.p0_failures).toEqual([]);
    expect(out.summary).toBe("done");
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("run() times out and returns failure", async () => {
    const r = new SubagentRunner(cfg);
    const slowClient = {
      model: "slow",
      provider: "test",
      chatWithFallback: async () => {
        await new Promise((res) => setTimeout(res, 5000));
        return { content: '{"status":"success"}' };
      },
    };
    let err;
    try {
      await r.run("p", { client: slowClient, timeoutMs: 100 });
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/timed out/);
  });

  test("_parseResult handles all-skipped response (D1 no tool access)", () => {
    const r = new SubagentRunner(cfg);
    const out = r._parseResult(JSON.stringify({
      status: "failure",
      executed_skills: [
        { name: "brainstorming", type: "skill", tier: "P0", result: "skipped", output: "No skill tool available", error: "no tool access" },
        { name: "codegraph_context", type: "codegraph", tier: "P0", result: "skipped", output: "No MCP tool available", error: "no tool access" }
      ],
      p0_failures: ["brainstorming", "codegraph_context"],
      summary: "All skills skipped — no tool access"
    }));
    expect(out.status).toBe("failure");
    expect(out.executed_skills).toHaveLength(2);
    expect(out.executed_skills.every(s => s.result === "skipped")).toBe(true);
    expect(out.p0_failures).toHaveLength(2);
  });

  test("run() returns all-skipped result when D1 has no tools", async () => {
    const r = new SubagentRunner(cfg);
    const fakeClient = {
      model: "fake-m",
      provider: "test",
      chatWithFallback: async () => ({
        content: JSON.stringify({
          status: "failure",
          executed_skills: [
            { name: "brainstorming", type: "skill", tier: "P0", result: "skipped", output: "No tool", error: "no tool access" }
          ],
          p0_failures: ["brainstorming"],
          summary: "All skipped"
        }),
        _model: "fake-m",
        _provider: "test",
        _fallback: false,
      }),
    };
    const out = await r.run("test", { client: fakeClient, timeoutMs: 2000 });
    expect(out.executed_skills).toHaveLength(1);
    expect(out.executed_skills[0].result).toBe("skipped");
    // completedSkills.filter(s => s.result === 'completed') would be empty
    const completedSkills = out.executed_skills.filter(s => s.result === "completed");
    expect(completedSkills).toHaveLength(0);
  });
});

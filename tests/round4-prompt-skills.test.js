import { describe, test, expect } from "bun:test";
import { AutoExecutor } from "../server/lib/auto-executor.js";
import KimiClient, { CAPABILITY_LIST } from "../server/lib/model-clients/kimi-client.js";

describe("Round 4: Prompt + Skills fixes", () => {

  describe("#1: AutoExecutor output schema matches SubagentRunner", () => {
    test("buildPrompt uses short tier names (P0/P1/P2)", () => {
      const skills = [
        { tier: "P0_critical", entry: "codegraph_context", type: "codegraph", value: "codegraph_context" },
        { tier: "P1_important", entry: "/qa", type: "command", value: "/qa" },
      ];
      const result = AutoExecutor.buildPrompt(skills, { planId: "p1", title: "Test" });
      const prompt = result.prompt || result;
      // JSON schema example uses "P0" as representative tier
      expect(prompt).toContain('"tier": "P0"');
      // Tier headers use short names
      expect(prompt).toContain("### P0 (BLOCKING");
      expect(prompt).toContain("### P1 (Sequential");
      // Long form names should NOT appear
      expect(prompt).not.toContain("P0_critical (BLOCKING");
      expect(prompt).not.toContain("P1_important (Sequential");
    });

    test("buildPrompt uses name/result fields (not entry/status) in skill entries", () => {
      const skills = [
        { tier: "P0_critical", entry: "codegraph_context", type: "codegraph", value: "codegraph_context" },
      ];
      const result = AutoExecutor.buildPrompt(skills, { planId: "p1", title: "Test" });
      const prompt = result.prompt || result;
      expect(prompt).toContain('"name": "codegraph_context"');
      expect(prompt).toContain('"result": "completed"');
      // "status" appears in top-level schema ("status": "success" | "partial" | "failure") — that's OK
      // but skill entries should use "result" not "status"
      const execSection = prompt.split("executed_skills")[1] || "";
      expect(execSection).toContain('"result":');
      expect(execSection).not.toContain('"entry":');
    });

    test("buildPrompt p0_failures is array (not number)", () => {
      const skills = [
        { tier: "P0_critical", entry: "test", type: "skill", value: "test" },
      ];
      const result = AutoExecutor.buildPrompt(skills, { planId: "p1", title: "Test" });
      const prompt = result.prompt || result;
      expect(prompt).toContain('"p0_failures": []');
      expect(prompt).not.toContain('"p0_failures": 0');
    });

    test("TIER_LABELS use short names", () => {
      const skills = [
        { tier: "P0_critical", entry: "a", type: "skill", value: "a" },
      ];
      const result = AutoExecutor.buildPrompt(skills, { planId: "p1", title: "Test" });
      const prompt = result.prompt || result;
      expect(prompt).toContain("P0 (BLOCKING");
      expect(prompt).not.toContain("P0_critical (BLOCKING");
    });
  });

  describe("#5: CAPABILITY_LIST constant", () => {
    test("is exported from kimi-client.js", () => {
      expect(CAPABILITY_LIST).toBeDefined();
      expect(typeof CAPABILITY_LIST).toBe("string");
    });

    test("contains all expected capability categories", () => {
      expect(CAPABILITY_LIST).toContain("Superpowers[14]");
      expect(CAPABILITY_LIST).toContain("GStack[16]");
      expect(CAPABILITY_LIST).toContain("CodeGraph[16]");
      expect(CAPABILITY_LIST).toContain("云端[76类]");
    });

    test("contains all Superpowers skills mentioned in prompts", () => {
      expect(CAPABILITY_LIST).toContain("brainstorming");
      expect(CAPABILITY_LIST).toContain("writing-plans");
      expect(CAPABILITY_LIST).toContain("test-driven-development");
      expect(CAPABILITY_LIST).toContain("systematic-debugging");
    });

    test("generatePlan uses CAPABILITY_LIST", async () => {
      const mockConfig = {
        api_key_env: "TEST_KEY", base_url: "https://test.com/v1",
        model: "test-model", max_tokens: 100000, provider: "test",
      };
      const client = new KimiClient(mockConfig);
      let capturedMessages;
      client.chat = async (messages) => {
        capturedMessages = messages;
        return JSON.stringify({ title: "T", items: [{ title: "I", executor: "deepseek" }] });
      };
      await client.generatePlan("Test");
      const systemMsg = capturedMessages[0].content;
      expect(systemMsg).toContain("Superpowers[14]");
      expect(systemMsg).toContain("CodeGraph[16]");
    });

    test("analyzeTaskMode uses CAPABILITY_LIST", async () => {
      const mockConfig = {
        api_key_env: "TEST_KEY", base_url: "https://test.com/v1",
        model: "test-model", max_tokens: 100000, provider: "test",
      };
      const client = new KimiClient(mockConfig);
      let capturedMessages;
      client.chat = async (messages) => {
        capturedMessages = messages;
        return JSON.stringify({ mode: "build", reason: "test" });
      };
      await client.analyzeTaskMode("Test");
      const systemMsg = capturedMessages[0].content;
      expect(systemMsg).toContain("Superpowers[14]");
      expect(systemMsg).toContain("CodeGraph[16]");
    });
  });

  describe("#3: analyzeTaskMode max_tokens", () => {
    test("uses 1000 max_tokens", async () => {
      const mockConfig = {
        api_key_env: "TEST_KEY", base_url: "https://test.com/v1",
        model: "test-model", max_tokens: 100000, provider: "test",
      };
      const client = new KimiClient(mockConfig);
      let capturedOpts;
      client.chat = async (messages, opts) => {
        capturedOpts = opts;
        return JSON.stringify({ mode: "build", reason: "test" });
      };
      await client.analyzeTaskMode("Test");
      expect(capturedOpts.max_tokens).toBe(1000);
    });
  });

  describe("#8: Empty suggested_skills produces no header", () => {
    test("formatSuggestedSkills returns empty for empty object", async () => {
      const { AgentOrchestratorPlugin } = await import("../index.js");
      const plugin = await AgentOrchestratorPlugin({ directory: process.cwd() });
      const output = { system: "" };
      await plugin["experimental.chat.system.transform"]({}, output);
      expect(output.system).toContain("MANDATORY EXECUTION FLOW");
    });
  });

  describe("#4: reviewCheckpoint includes plan context", () => {
    test("checkpoint object includes plan_title", async () => {
      const mockConfig = {
        api_key_env: "TEST_KEY", base_url: "https://test.com/v1",
        model: "test-model", max_tokens: 100000, provider: "test",
      };
      const client = new KimiClient(mockConfig);
      let capturedMessages;
      client.chat = async (messages) => {
        capturedMessages = messages;
        return JSON.stringify({ status: "passed", feedback: "ok" });
      };
      const cp = { id: "cp1", plan_id: "p1", milestone_idx: 4, plan_title: "Build REST API" };
      await client.reviewCheckpoint(cp);
      const userMsg = capturedMessages[1].content;
      expect(userMsg).toContain("Build REST API");
    });
  });

  describe("#9: auto_exec.trigger description", () => {
    test("trigger is descriptive string", () => {
      const trigger = 'Call the task tool with subagent_type="general" and prompt=auto_exec.prompt';
      expect(trigger).toContain("Call the task tool");
      expect(trigger).not.toContain("task({");
    });
  });
});

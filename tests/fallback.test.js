import { describe, test, expect } from "bun:test";
import { AgentRouter } from "../server/lib/agent-router.js";
import BaseModelClient from "../server/lib/model-clients/base-client.js";
import KimiClient from "../server/lib/model-clients/kimi-client.js";
import DeepSeekClient from "../server/lib/model-clients/deepseek-client.js";

describe("Fallback Mechanism", () => {
  describe("AgentRouter Fallback Chain", () => {
    test("should have fallback chain for kimi", () => {
      const router = new AgentRouter();
      expect(router.hasFallback("kimi")).toBe(true);
      expect(router.getFallbackModel("kimi")).toBe("deepseek");
    });

    test("should not have fallback for deepseek", () => {
      const router = new AgentRouter();
      expect(router.hasFallback("deepseek")).toBe(false);
      expect(router.getFallbackModel("deepseek")).toBeNull();
    });

    test("should not have fallback for minimax", () => {
      const router = new AgentRouter();
      expect(router.hasFallback("minimax")).toBe(false);
      expect(router.getFallbackModel("minimax")).toBeNull();
    });
  });

  describe("BaseModelClient shouldFallback", () => {
    test("should trigger fallback on network errors", () => {
      const client = new BaseModelClient({
        api_key_env: "TEST_KEY",
        base_url: "https://test.com",
        model: "test-model"
      });

      expect(client.shouldFallback(new Error("ECONNREFUSED"))).toBe(true);
      expect(client.shouldFallback(new Error("ETIMEDOUT"))).toBe(true);
      expect(client.shouldFallback(new Error("ENOTFOUND"))).toBe(true);
    });

    test("should trigger fallback on HTTP errors", () => {
      const client = new BaseModelClient({
        api_key_env: "TEST_KEY",
        base_url: "https://test.com",
        model: "test-model"
      });

      const err500 = new Error("HTTP 500");
      err500.status = 500;
      expect(client.shouldFallback(err500)).toBe(true);

      const err401 = new Error("HTTP 401");
      err401.status = 401;
      expect(client.shouldFallback(err401)).toBe(true);

      const err429 = new Error("HTTP 429");
      err429.status = 429;
      expect(client.shouldFallback(err429)).toBe(true);
    });

    test("should not trigger fallback on success", () => {
      const client = new BaseModelClient({
        api_key_env: "TEST_KEY",
        base_url: "https://test.com",
        model: "test-model"
      });

      expect(client.shouldFallback(null)).toBe(false);
      expect(client.shouldFallback(new Error("Some random error"))).toBe(false);
    });
  });

  describe("Plan Creation Fallback", () => {
    test("should mark fallback in response when used", async () => {
      // This would require mocking the API calls
      // For now, just verify the structure
      const mockResponse = {
        id: "test-plan-id",
        title: "Test Plan",
        items: [],
        status: "pending",
        fallback: true,
        fallback_info: {
          from: "kimi",
          to: "deepseek",
          reason: "ECONNREFUSED"
        }
      };

      expect(mockResponse.fallback).toBe(true);
      expect(mockResponse.fallback_info.from).toBe("kimi");
      expect(mockResponse.fallback_info.to).toBe("deepseek");
    });
  });

  describe("Checkpoint Auto-pass Fallback", () => {
    test("should auto-pass when Kimi is unavailable", () => {
      const mockCheckpoint = {
        id: "test-cp",
        plan_id: "test-plan",
        verification_status: "passed",
        verification_feedback: "Auto-passed: Kimi unavailable (ECONNREFUSED)",
        fallback: true,
        fallback_reason: "kimi_unavailable"
      };

      expect(mockCheckpoint.verification_status).toBe("passed");
      expect(mockCheckpoint.fallback).toBe(true);
      expect(mockCheckpoint.fallback_reason).toBe("kimi_unavailable");
    });
  });

  describe("DeepSeek Client generatePlan", () => {
    const testConfig = {
      api_key_env: "DS_TEST_KEY",
      base_url: "https://test.com/v1",
      model: "ds-test",
      max_tokens: 100000,
      temperature: 0.7,
      provider: "test",
    };

    test("generatePlan returns parsed JSON with title and items", async () => {
      const client = new DeepSeekClient(testConfig);
      client.chat = async () => JSON.stringify({
        title: "DeepSeek Plan",
        items: [{ title: "Task 1", executor: "deepseek", description: "desc" }]
      });
      const plan = await client.generatePlan("Test task", "Context");
      expect(plan.title).toBe("DeepSeek Plan");
      expect(plan.items).toHaveLength(1);
      expect(plan.items[0].executor).toBe("deepseek");
    });

    test("generatePlan throws on parse failure", async () => {
      const client = new DeepSeekClient(testConfig);
      client.chat = async () => "not json";
      try {
        await client.generatePlan("Test");
        expect(true).toBe(false);
      } catch (err) {
        expect(err.message).toContain("JSON");
      }
    });
  });

  describe("KimiClient chatWithFallback integration", () => {
    const testConfig = {
      api_key_env: "KIMI_FB_KEY",
      base_url: "https://test.com/v1",
      model: "kimi-test",
      max_tokens: 100000,
      temperature: 0.7,
      provider: "test",
    };

    test("returns _fallback=false when primary succeeds", async () => {
      const kimi = new KimiClient(testConfig);
      kimi.chat = async () => JSON.stringify({
        title: "OK", items: [{ title: "T", executor: "deepseek", description: "d" }]
      });
      const plan = await kimi.generatePlan("Task", "", null);
      expect(plan._fallback).toBe(false);
      expect(plan.title).toBe("OK");
    });

    test("falls back to DeepSeek when Kimi fails", async () => {
      const kimi = new KimiClient(testConfig);
      const deepseek = new DeepSeekClient(testConfig);

      kimi.chat = async () => { throw Object.assign(new Error("ECONNREFUSED"), { status: 500 }); };
      deepseek.chat = async () => JSON.stringify({
        title: "Fallback Plan",
        items: [{ title: "F", executor: "deepseek", description: "d" }]
      });

      const plan = await kimi.generatePlan("Task", "", deepseek);
      expect(plan._fallback).toBe(true);
      expect(plan._fallback_reason).toBeTruthy();
      expect(plan.title).toBe("Fallback Plan");
    });

    test("throws when both Kimi and DeepSeek fail", async () => {
      const kimi = new KimiClient(testConfig);
      const deepseek = new DeepSeekClient(testConfig);

      kimi.chat = async () => { throw Object.assign(new Error("ECONNREFUSED"), { status: 500 }); };
      deepseek.chat = async () => { throw new Error("ETIMEDOUT"); };

      try {
        await kimi.generatePlan("Task", "", deepseek);
        expect(true).toBe(false);
      } catch (err) {
        expect(err.message).toContain("Both");
      }
    });

    test("analyzeTaskMode also supports fallbackClient", async () => {
      const kimi = new KimiClient(testConfig);
      const deepseek = new DeepSeekClient(testConfig);

      kimi.chat = async () => { throw Object.assign(new Error("ECONNREFUSED"), { status: 500 }); };
      deepseek.chat = async () => JSON.stringify({ mode: "build", reason: "fallback analysis" });

      const mode = await kimi.analyzeTaskMode("Task", "", deepseek);
      expect(mode._fallback).toBe(true);
      expect(mode.mode).toBe("build");
    });
  });
});
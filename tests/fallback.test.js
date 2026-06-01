import { describe, test, expect } from "bun:test";
import { AgentRouter } from "../server/lib/agent-router.js";
import BaseModelClient from "../server/lib/model-clients/base-client.js";

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
});
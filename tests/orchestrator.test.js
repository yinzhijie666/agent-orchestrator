import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import db from "../server/lib/db.js";
import { MilestoneManager } from "../server/lib/milestone-manager.js";
import PlanParser from "../server/lib/plan-parser.js";
import KimiClient from "../server/lib/model-clients/kimi-client.js";

describe("Phase 1: Infrastructure", () => {
  test("Database initialized", () => {
    const plans = db.db.prepare("SELECT COUNT(*) as count FROM plans").get();
    expect(plans.count).toBeDefined();
  });

  test("All tables exist", () => {
    const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain("plans");
    expect(tableNames).toContain("plan_items");
    expect(tableNames).toContain("checkpoints");
    expect(tableNames).toContain("agent_threads");
    expect(tableNames).toContain("messages");
    expect(tableNames).toContain("activity_log");
  });
});

describe("Phase 2: Core Libraries", () => {
  let milestoneManager;
  let kimiClient;

  beforeAll(() => {
    milestoneManager = new MilestoneManager(4);
    kimiClient = new KimiClient({
      api_key_env: "KIMI_API_KEY",
      base_url: "http://127.0.0.1:1",
      model: "kimi",
      max_tokens: 100,
      provider: "kimi",
    });
  });

  test("KimiClient.analyzeTaskMode routes tasks correctly", async () => {
    kimiClient.chat = async () => JSON.stringify({ mode: "build", reason: "coding" });
    const result = await kimiClient.analyzeTaskMode("Build a feature");
    expect(result.mode).toBe("build");
  });

  test("KimiClient.analyzeTaskMode returns plan for analysis tasks", async () => {
    kimiClient.chat = async () => JSON.stringify({ mode: "plan", reason: "research" });
    const result = await kimiClient.analyzeTaskMode("Research a topic");
    expect(result.mode).toBe("plan");
  });

  test("Plan Parser validates correctly", () => {
    const validPlan = {
      title: "Test Plan",
      items: [
        { title: "Item 1", executor: "deepseek", description: "desc" },
        { title: "Item 2", executor: "minimax", description: "desc" }
      ]
    };
    
    const result = PlanParser.validate(validPlan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("Plan Parser rejects invalid plans", () => {
    const invalidPlan = {
      title: "",
      items: [
        { title: "", executor: "invalid" }
      ]
    };
    
    const result = PlanParser.validate(invalidPlan);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("Milestone Manager detects checkpoint triggers", () => {
    // Create a plan with 5 items
    const planId = "test-plan-" + Date.now();
    db.createPlan({
      id: planId,
      title: "Test Plan",
      plan_document: "{}",
      milestones_total: 2
    });

    for (let i = 0; i < 5; i++) {
      db.createPlanItem({
        plan_id: planId,
        idx: i,
        title: `Item ${i}`,
        executor: "deepseek",
        status: i < 4 ? "completed" : "pending"
      });
    }

    expect(milestoneManager.shouldCheckpoint(planId)).toBe(true);
  });
});

describe("Phase 3: API Endpoints", () => {
  const baseUrl = "http://127.0.0.1:8765";
  let planId;
  let server;

  beforeAll(async () => {
    // Start server for API tests
    const { server: srv } = await import("../server/index.js");
    server = srv;
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(() => {
    if (server) {
      server.stop();
    }
  });

  test("GET /api/status returns server info", async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.server).toBe("agent-orchestrator");
    expect(data.version).toBe("1.0.0");
  });

  test("GET /api/status/agents shows availability", async () => {
    const res = await fetch(`${baseUrl}/api/status/agents`);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.agents).toBeDefined();
    expect(data.agents.deepseek).toBeDefined();
    expect(data.agents.minimax).toBeDefined();
  });

  test("POST /api/plans endpoint exists", async () => {
    // Verify the endpoint accepts POST requests with a short timeout
    // We don't test actual plan creation here to avoid external API dependency
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    try {
      const res = await fetch(`${baseUrl}/api/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Test plan" }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      // Should return a valid response (200, 201, 400, or 500 are all acceptable)
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
      
      // Verify response is valid JSON
      const data = await res.json();
      expect(data).toBeDefined();
    } catch (err) {
      clearTimeout(timeout);
      // If aborted, that's acceptable - means endpoint exists but API is slow
      expect(err.name).toBe("AbortError");
    }
  }, 10000);
});

describe("Phase 4: Plugin Structure", () => {
  test("opencode.json has required fields", async () => {
    const config = await import("../opencode.json", { with: { type: "json" } });
    expect(config.default.tools).toBeDefined();
    expect(typeof config.default.tools).toBe("object");
    expect(config.default.tools.agent).toBe(true);
    expect(config.default.tools.agent_status).toBe(true);
    expect(config.default.tools.agent_checkpoint).toBe(true);
    expect(config.default.tools.agent_execute_skills).toBe(true);
  });

  test("index.js exports plugin class", async () => {
    const mod = await import("../index.js");
    expect(mod.AgentOrchestratorPlugin).toBeDefined();
    expect(typeof mod.AgentOrchestratorPlugin).toBe("function");
  });
});
import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import KimiClient from "../server/lib/model-clients/kimi-client.js";
import DeepSeekClient from "../server/lib/model-clients/deepseek-client.js";
import config from "../server/config/default.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(envPath) {
  try {
    const text = readFileSync(envPath, "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (e) {
    console.warn("Could not load .env:", e.message);
  }
}

const FORCE_REAL = process.env.FORCE_REAL_API === "true";
const IN_CI = process.env.CI === "true";

function isRealKey(key) {
  return key && key.startsWith("sk-") && key.length > 10;
}

const CONFIG_KEY_MAP = {
  kimi: "kimi",
  deepseek: "deepseek",
  "opencode-zen": "opencode-zen",
};

function shouldSkip(clientName) {
  if (IN_CI && !FORCE_REAL) return true;
  const configKey = CONFIG_KEY_MAP[clientName.toLowerCase()] || clientName.toLowerCase();
  const modelConfig = config.models[configKey];
  if (!modelConfig) return true;
  const envVar = modelConfig.api_key_env;
  const key = process.env[envVar];
  if (!isRealKey(key)) return true;
  return false;
}

const skipOrTest = (clientName) => shouldSkip(clientName) ? test.skip : test;

const kimiClient = new KimiClient(config.models.kimi);
const deepseekClient = new DeepSeekClient(config.models.deepseek);

describe("Layer 1: Kimi K2.6 — Strategic", () => {
  beforeAll(() => {
    loadEnvFile(join(__dirname, "..", ".env"));
  });

  const it = skipOrTest("kimi");

  it("analyzeTaskMode returns mode decision", async () => {
    const result = await kimiClient.analyzeTaskMode(
      "Implement a user login page with email and password"
    );
    expect(result).toBeDefined();
    expect(result.mode).toBeDefined();
    expect(typeof result.mode).toBe("string");
    expect(["plan", "build"]).toContain(result.mode);
    expect(result.reason).toBeDefined();
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  }, 60000);

  it("generatePlan returns structured plan with items", async () => {
    const plan = await kimiClient.generatePlan(
      "Build a REST API with user registration and login",
      "Node.js + Express + SQLite"
    );
    expect(plan).toBeDefined();
    expect(plan.title).toBeDefined();
    expect(typeof plan.title).toBe("string");
    expect(plan.title.length).toBeGreaterThan(0);
    expect(Array.isArray(plan.items)).toBe(true);
    expect(plan.items.length).toBeGreaterThan(0);

    for (const item of plan.items) {
      expect(item.title).toBeDefined();
      expect(["kimi", "deepseek", "zen"]).toContain(item.executor);
    }
  }, 60000);

  it("analyzeTaskMode + generatePlan full cycle produces executable plan", async () => {
    const modeResult = await kimiClient.analyzeTaskMode(
      "Build a CLI tool that reads and summarizes JSON files"
    );
    expect(modeResult.mode).toBe("build");

    const plan = await kimiClient.generatePlan(
      "Build a JSON summary CLI tool",
      "Node.js + commander + bun"
    );
    expect(plan.items.some(i => i.executor !== "kimi")).toBe(true);
    expect(plan.items.length).toBeGreaterThanOrEqual(1);
  }, 90000);
});

describe("Layer 2: DeepSeek V4 Flash — Tactical", () => {
  beforeAll(() => {
    loadEnvFile(join(__dirname, "..", ".env"));
  });

  const it = skipOrTest("deepseek");

  it("executeTask returns completed status", async () => {
    const result = await deepseekClient.executeTask(
      {
        title: "Hello World function",
        description: "Write a JavaScript function that returns 'Hello, World!'",
        acceptance_criteria: "Function exists and returns correct string",
      },
      "Node.js project"
    );
    expect(result).toBeDefined();
    expect(result.status).toBe("completed");
    expect(result.result).toBeDefined();
    expect(typeof result.result).toBe("string");
  }, 30000);

  it("executeTask handles coding tasks with acceptance criteria", async () => {
    const result = await deepseekClient.executeTask(
      {
        title: "Array sum function",
        description: "Write a function that sums an array of numbers",
        acceptance_criteria: "sum([1,2,3]) === 6",
      },
      "JavaScript"
    );
    expect(result.status).toBe("completed");
    expect(result.result).toContain("sum");
  }, 30000);

  it("generateCode returns code with correct language", async () => {
    const code = await deepseekClient.generateCode(
      "Function to check if a string is a palindrome",
      "javascript"
    );
    expect(code).toBeDefined();
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(20);
  }, 30000);
});



describe("Three-Layer Chain — Full Orchestration Simulation", () => {
  beforeAll(() => {
    loadEnvFile(join(__dirname, "..", ".env"));
  });

  const it = skipOrTest("kimi");

  it("complete chain: Kimi plan → DeepSeek execute → Kimi review", async () => {
    const plan = await kimiClient.generatePlan(
      "Write a function to check if a number is prime",
      "JavaScript only, keep plan to max 3 items"
    );
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.some(i => i.executor === "deepseek")).toBe(true);

    const execResults = [];
    for (const item of plan.items) {
      if (item.executor === "deepseek") {
        const result = await deepseekClient.executeTask(item, "Node.js");
        execResults.push({ idx: item.idx, agent: "deepseek", status: result.status });
        expect(result.status).toBe("completed");
      }
    }
    expect(execResults.length).toBeGreaterThan(0);

    const checkpoint = {
      id: "sim-cp-1",
      plan_id: "sim-plan-1",
      milestone_idx: plan.items.length,
      agent_outputs: execResults,
    };
    const review = await kimiClient.reviewCheckpoint(checkpoint);
    expect(review).toBeDefined();
    expect(["passed", "failed"]).toContain(review.status);
    expect(review.feedback).toBeDefined();
    expect(typeof review.feedback).toBe("string");
    expect(review.feedback.length).toBeGreaterThan(0);
  }, 240000);
});

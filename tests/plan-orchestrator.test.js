import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { Database } from "bun:sqlite";
import { PlanOrchestrator } from "../server/lib/plan-orchestrator.js";
import { DB } from "../server/lib/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = join(__dirname, "test-plan-orchestrator.sqlite");

function initTestSchema(dbPath) {
  const db = new Database(dbPath, { create: true });
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      plan_document TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      milestones_total INTEGER DEFAULT 0,
      milestones_completed INTEGER DEFAULT 0,
      fallback_used INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS plan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      executor TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      milestone_idx INTEGER NOT NULL,
      agent_outputs TEXT,
      verification_status TEXT DEFAULT 'pending',
      verification_feedback TEXT,
      verified_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      verified_at DATETIME,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );
    CREATE TABLE IF NOT EXISTS agent_threads (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      context_window TEXT,
      layer_states TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      agent TEXT,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES agent_threads(id)
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT,
      agent TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.close();
}

function makeMockDb(dbPath) {
  initTestSchema(dbPath);
  return new DB(dbPath);
}

function makeMockKimiClient(planDoc, options = {}) {
  return {
    generatePlan: async () => {
      if (options.throwError) throw new Error("Kimi API down");
      if (options.returnInvalid) {
        return { title: "Bad", items: [{ idx: 0, title: "no executor" }] };
      }
      if (options.useFallback) {
        return { ...planDoc, _fallback: true, _fallback_reason: "rate limit" };
      }
      return planDoc;
    }
  };
}

function makeMockDeepseekClient() {
  return { name: "deepseek" };
}

const SAMPLE_PLAN = {
  title: "Sample Plan",
  items: [
    { idx: 0, title: "Item A", description: "First", executor: "kimi" },
    { idx: 1, title: "Item B", description: "Second", executor: "deepseek" },
    { idx: 2, title: "Item C", description: "Third", executor: "minimax" },
  ]
};

describe("PlanOrchestrator.generateAndPersist", () => {
  beforeAll(async () => {
    await rm(TEST_DB_PATH, { force: true });
  });

  test("creates plan, items, thread, and activity log", async () => {
    const db = makeMockDb(TEST_DB_PATH);
    const kimi = makeMockKimiClient(SAMPLE_PLAN);
    const ds = makeMockDeepseekClient();

    const result = await PlanOrchestrator.generateAndPersist({
      prompt: "Test",
      context: "",
      kimiClient: kimi,
      deepseekClient: ds,
      db,
      status: "active",
      milestoneInterval: 4,
    });

    expect(result.planId).toBeTruthy();
    expect(result.planDoc.title).toBe("Sample Plan");
    expect(result.fallbackUsed).toBe(false);
    expect(result.fallbackInfo).toBeNull();

    const plan = db.getPlan(result.planId);
    expect(plan.title).toBe("Sample Plan");
    expect(plan.status).toBe("active");
    expect(plan.fallback_used).toBe(0);

    const items = db.getPlanItems(result.planId);
    expect(items.length).toBe(3);
    expect(items[0].executor).toBe("kimi");

    db.close();
  });

  test("records fallback metadata when _fallback is set", async () => {
    const db = makeMockDb(TEST_DB_PATH + ".fb");
    const kimi = makeMockKimiClient(SAMPLE_PLAN, { useFallback: true });
    const ds = makeMockDeepseekClient();

    const result = await PlanOrchestrator.generateAndPersist({
      prompt: "Test FB",
      context: "",
      kimiClient: kimi,
      deepseekClient: ds,
      db,
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackInfo.from).toBe("kimi");
    expect(result.fallbackInfo.to).toBe("deepseek");
    expect(result.fallbackInfo.reason).toBe("rate limit");
    expect(result.fallbackInfo.timestamp).toBeTruthy();

    const plan = db.getPlan(result.planId);
    expect(plan.fallback_used).toBe(1);

    db.close();
  });

  test("throws wrapped error when Kimi fails", async () => {
    const db = makeMockDb(TEST_DB_PATH + ".err");
    const kimi = makeMockKimiClient(SAMPLE_PLAN, { throwError: true });
    const ds = makeMockDeepseekClient();

    await expect(
      PlanOrchestrator.generateAndPersist({
        prompt: "Test err",
        context: "",
        kimiClient: kimi,
        deepseekClient: ds,
        db,
      })
    ).rejects.toThrow(/Plan generation failed/);

    db.close();
  });

  test("throws validation error when plan is invalid", async () => {
    const db = makeMockDb(TEST_DB_PATH + ".inv");
    const kimi = makeMockKimiClient(SAMPLE_PLAN, { returnInvalid: true });
    const ds = makeMockDeepseekClient();

    try {
      await PlanOrchestrator.generateAndPersist({
        prompt: "Test invalid",
        context: "",
        kimiClient: kimi,
        deepseekClient: ds,
        db,
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err.message).toContain("Invalid plan");
      expect(err.details).toBeDefined();
    }

    db.close();
  });

  test("honors custom status and milestoneInterval", async () => {
    const db = makeMockDb(TEST_DB_PATH + ".status");
    const kimi = makeMockKimiClient(SAMPLE_PLAN);
    const ds = makeMockDeepseekClient();

    const result = await PlanOrchestrator.generateAndPersist({
      prompt: "Status test",
      context: "",
      kimiClient: kimi,
      deepseekClient: ds,
      db,
      status: "pending",
      milestoneInterval: 2,
    });

    const plan = db.getPlan(result.planId);
    expect(plan.status).toBe("pending");
    expect(plan.milestones_total).toBe(2);

    db.close();
  });
});

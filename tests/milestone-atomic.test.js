import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { Database } from "bun:sqlite";
import { DB } from "../server/lib/db.js";
import { SCHEMA_SQL } from "../server/lib/db-schema.js";
import { AgentRouter, MilestoneManager } from "../server/lib/agent-router.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function initSchema(dbPath) {
  const raw = new Database(dbPath, { create: true });
  raw.exec(SCHEMA_SQL);
  raw.close();
}

describe("Milestone atomic increment (PR2: Stage 3.3)", () => {
  const TEST_DB = join(__dirname, "test-milestone-atomic.sqlite");
  let localDb;

  beforeAll(async () => {
    await rm(TEST_DB, { force: true });
    initSchema(TEST_DB);
    localDb = new DB(TEST_DB);
    localDb.createPlan({
      id: "p1",
      title: "P1",
      plan_document: "{}",
      status: "active",
      milestones_completed: 0,
    });
  });

  afterAll(() => {
    localDb.close();
  });

  test("atomic SQL UPDATE increments by 1 (mirrors server/api/checkpoint.js)", () => {
    localDb.db.prepare(
      "UPDATE plans SET milestones_completed = milestones_completed + 1 WHERE id = ?"
    ).run("p1");
    const after1 = localDb.getPlan("p1");
    expect(after1.milestones_completed).toBe(1);

    localDb.db.prepare(
      "UPDATE plans SET milestones_completed = milestones_completed + 1 WHERE id = ?"
    ).run("p1");
    const after2 = localDb.getPlan("p1");
    expect(after2.milestones_completed).toBe(2);
  });

  test("updatePlanMilestones still works (legacy callers)", () => {
    localDb.updatePlanMilestones("p1", 5);
    const p = localDb.getPlan("p1");
    expect(p.milestones_completed).toBe(5);
  });
});

describe("MilestoneManager still functional (server/api/checkpoint.js path)", () => {
  const TEST_DB2 = join(__dirname, "test-milestone-manager.sqlite");
  let localDb2;
  let originalDbPath;

  beforeAll(async () => {
    await rm(TEST_DB2, { force: true });
    initSchema(TEST_DB2);
    originalDbPath = process.env.AGENT_ORCHESTRATOR_DB_PATH;
    process.env.AGENT_ORCHESTRATOR_DB_PATH = TEST_DB2;
    const { getDefaultDB } = await import("../server/lib/db.js");
    const defaultDb = getDefaultDB();
    defaultDb.db.close();
    Object.assign(defaultDb, new DB(TEST_DB2));

    defaultDb.createPlan({ id: "p2", title: "P2", plan_document: "{}", status: "active" });
    for (let i = 0; i < 5; i++) {
      defaultDb.createPlanItem({
        plan_id: "p2",
        idx: i,
        title: `I${i}`,
        executor: "kimi",
        status: i < 4 ? "completed" : "pending",
      });
    }
    localDb2 = defaultDb;
  });

  afterAll(() => {
    localDb2.close();
    if (originalDbPath) {
      process.env.AGENT_ORCHESTRATOR_DB_PATH = originalDbPath;
    }
  });

  test("shouldCheckpoint returns true at interval boundary", () => {
    const mm = new MilestoneManager(4);
    expect(mm.shouldCheckpoint("p2")).toBe(true);
  });

  test("createCheckpoint produces a valid checkpoint record", () => {
    const mm = new MilestoneManager(4);
    const cp = mm.createCheckpoint("p2", 4);
    expect(cp.id).toBeTruthy();
    expect(cp.milestone_idx).toBe(4);
    expect(cp.verification_status).toBe("pending");
  });
});

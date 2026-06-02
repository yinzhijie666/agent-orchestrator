import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { AgentOrchestratorPlugin } from "../index.js";
import { DB } from "../server/lib/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, "test-pr4.sqlite");

let plugin;
let db;

describe("PR4: User 'failed' override not blocked by Kimi fallback", () => {
  beforeAll(async () => {
    await rm(TEST_DB, { force: true });
    process.env.AGENT_ORCHESTRATOR_DB_PATH = TEST_DB;
    process.env.AUTO_EXEC_DISPATCH = "false";
    process.env.OPENCODE_API_KEY = "sk-test";
    plugin = await AgentOrchestratorPlugin({ directory: __dirname });
    db = new DB(TEST_DB);
  });

  afterAll(async () => {
    if (plugin?.dispose) await plugin.dispose();
    db.close();
  });

  test("user 'failed' override works when Kimi falls back (auto-pass overridden)", async () => {
    db.createPlan({ id: "p-override", title: "P", plan_document: "{}", status: "active" });
    for (let i = 0; i < 4; i++) {
      db.createPlanItem({ plan_id: "p-override", idx: i, title: `I${i}`, executor: "kimi", status: "completed" });
    }

    const createOut = await plugin.tool.agent_checkpoint.execute({ action: "create", plan_id: "p-override" });
    expect(createOut.output).toContain("Checkpoint created");

    const verifyOut = await plugin.tool.agent_checkpoint.execute({
      action: "verify",
      plan_id: "p-override",
      result: "failed",
    });

    expect(verifyOut.output).toContain("verified: failed");
    expect(verifyOut.output).toContain("User override");

    const cp = db.db.prepare(
      "SELECT verification_status FROM checkpoints WHERE plan_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get("p-override");
    expect(cp.verification_status).toBe("failed");
  });
});

describe("PR4: completed_with_errors writes completed_at", () => {
  const TEST_DB2 = join(__dirname, "test-pr4-completed-at.sqlite");
  let localDb;

  beforeAll(async () => {
    const { Database } = await import("bun:sqlite");
    const { SCHEMA_SQL } = await import("../server/lib/db-schema.js");
    await rm(TEST_DB2, { force: true });
    const raw = new Database(TEST_DB2, { create: true });
    raw.exec(SCHEMA_SQL);
    raw.close();
    localDb = new DB(TEST_DB2);
  });

  afterAll(() => { localDb.close(); });

  test("completed_with_errors sets completed_at", () => {
    localDb.createPlan({ id: "p1", title: "T", plan_document: "{}", status: "active" });
    const plan = localDb.updatePlanStatus("p1", "completed_with_errors");
    expect(plan.completed_at).toBeTruthy();
    expect(plan.status).toBe("completed_with_errors");
  });

  test("cancelled sets completed_at", () => {
    localDb.createPlan({ id: "p2", title: "T", plan_document: "{}", status: "active" });
    const plan = localDb.updatePlanStatus("p2", "cancelled");
    expect(plan.completed_at).toBeTruthy();
  });
});

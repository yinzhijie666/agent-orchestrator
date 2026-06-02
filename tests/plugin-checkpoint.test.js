import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { AgentOrchestratorPlugin } from "../index.js";
import { DB } from "../server/lib/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, "test-plugin-checkpoint.sqlite");

let plugin;
let db;

describe("agent_checkpoint tool (PR2: Stages 2.2, 2.5, 2.6)", () => {
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

  test("create rejects when no items completed", async () => {
    db.createPlan({ id: "p-empty", title: "P", plan_document: "{}", status: "active" });
    db.createPlanItem({ plan_id: "p-empty", idx: 0, title: "I0", executor: "kimi", status: "pending" });
    db.createPlanItem({ plan_id: "p-empty", idx: 1, title: "I1", executor: "kimi", status: "pending" });

    const out = await plugin.tool.agent_checkpoint.execute({ action: "create", plan_id: "p-empty" });
    expect(out.output).toContain("No completed items yet");
  });

  test("create succeeds with completed items and uses items_before_milestone key", async () => {
    db.createPlan({ id: "p-ok", title: "P-OK", plan_document: "{}", status: "active" });
    for (let i = 0; i < 4; i++) {
      db.createPlanItem({
        plan_id: "p-ok",
        idx: i,
        title: `I${i}`,
        executor: "kimi",
        status: i < 4 ? "completed" : "pending",
      });
    }

    const out = await plugin.tool.agent_checkpoint.execute({ action: "create", plan_id: "p-ok" });
    expect(out.output).toContain("Checkpoint created at milestone 4");

    const cp = db.db.prepare(
      "SELECT agent_outputs FROM checkpoints WHERE plan_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get("p-ok");
    const parsed = JSON.parse(cp.agent_outputs);
    expect(parsed.items_before_milestone).toBeDefined();
    expect(parsed.milestone_idx).toBe(4);
  });

  test("verify increments milestone atomically when checkpoint passes", async () => {
    db.createPlan({ id: "p-vf", title: "P-VF", plan_document: "{}", status: "active" });
    db.createPlanItem({ plan_id: "p-vf", idx: 0, title: "I0", executor: "kimi", status: "completed" });
    db.createPlanItem({ plan_id: "p-vf", idx: 1, title: "I1", executor: "kimi", status: "completed" });
    db.createPlanItem({ plan_id: "p-vf", idx: 2, title: "I2", executor: "kimi", status: "completed" });
    db.createPlanItem({ plan_id: "p-vf", idx: 3, title: "I3", executor: "kimi", status: "completed" });

    const createOut = await plugin.tool.agent_checkpoint.execute({ action: "create", plan_id: "p-vf" });
    expect(createOut.output).toContain("Checkpoint created");

    const beforePlan = db.getPlan("p-vf");
    const beforeMilestones = beforePlan.milestones_completed;

    const verifyOut = await plugin.tool.agent_checkpoint.execute({ action: "verify", plan_id: "p-vf" });
    expect(verifyOut.output).toMatch(/verified: passed/);

    const afterPlan = db.getPlan("p-vf");
    expect(afterPlan.milestones_completed).toBe(beforeMilestones + 1);
  });

  test("no pending checkpoint returns informative message", async () => {
    db.createPlan({ id: "p-np", title: "P-NP", plan_document: "{}", status: "active" });
    const out = await plugin.tool.agent_checkpoint.execute({ action: "verify", plan_id: "p-np" });
    expect(out.output).toBe("No pending checkpoints to verify for this plan.");
  });
});

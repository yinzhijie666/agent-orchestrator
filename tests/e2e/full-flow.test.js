import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import { SCHEMA_SQL } from "../../server/lib/db-schema.js";
import { runMigrations } from "../../server/lib/db-migrate.js";
import { DB } from "../../server/lib/db.js";
import { MilestoneManager } from "../../server/lib/milestone-manager.js";
import PlanParser from "../../server/lib/plan-parser.js";

const TEST_DB = join(__dirname, "test-full-flow.sqlite");

function setupDb() {
  try { unlinkSync(TEST_DB); } catch {}
  const raw = new Database(TEST_DB);
  raw.exec(SCHEMA_SQL);
  runMigrations(raw);
  raw.close();
  return new DB(TEST_DB);
}

describe("E2E: Full Plan Flow", () => {
  let db;

  beforeAll(() => {
    db = setupDb();
  });

  afterAll(() => {
    db.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  test("plan lifecycle: create → activate → items → complete", () => {
    // 1. Create plan
    const plan = db.createPlan({
      id: "e2e-plan-1",
      title: "E2E Test Plan",
      plan_document: JSON.stringify({
        title: "E2E Test Plan",
        items: [
          { title: "Step 1", description: "First step", executor: "deepseek" },
          { title: "Step 2", description: "Second step", executor: "deepseek" },
        ],
      }),
      milestones_total: 2,
    });
    expect(plan.id).toBe("e2e-plan-1");
    expect(plan.status).toBe("pending");

    // 2. Activate plan
    const activated = db.updatePlanStatus("e2e-plan-1", "active");
    expect(activated.status).toBe("active");

    // 3. Create plan items
    db.createPlanItem({ plan_id: "e2e-plan-1", idx: 0, title: "Step 1", executor: "deepseek" });
    db.createPlanItem({ plan_id: "e2e-plan-1", idx: 1, title: "Step 2", executor: "deepseek" });

    const items = db.getPlanItems("e2e-plan-1");
    expect(items.length).toBe(2);
    expect(items[0].status).toBe("pending");

    // 4. Start and complete item 0
    db.updatePlanItemStatus("e2e-plan-1", 0, "running");
    expect(db.getPlanItem("e2e-plan-1", 0).status).toBe("running");

    db.updatePlanItemStatus("e2e-plan-1", 0, "completed", '{"result":"done"}');
    const completed0 = db.getPlanItem("e2e-plan-1", 0);
    expect(completed0.status).toBe("completed");
    expect(completed0.completed_at).toBeTruthy();

    // 5. Start and complete item 1
    db.updatePlanItemStatus("e2e-plan-1", 1, "running");
    db.updatePlanItemStatus("e2e-plan-1", 1, "completed", '{"result":"done"}');

    // 6. Update milestones
    db.updatePlanMilestones("e2e-plan-1", 2);
    expect(db.getPlan("e2e-plan-1").milestones_completed).toBe(2);

    // 7. Complete plan
    const completed = db.updatePlanStatus("e2e-plan-1", "completed");
    expect(completed.status).toBe("completed");
    expect(completed.completed_at).toBeTruthy();
  });

  test("checkpoint lifecycle: create → verify", () => {
    // 1. Create checkpoint
    const cp = db.createCheckpoint({
      id: "e2e-cp-1",
      plan_id: "e2e-plan-1",
      milestone_idx: 1,
      agent_outputs: { step1: "done" },
    });
    expect(cp.verification_status).toBe("pending");

    // 2. Verify checkpoint
    const verified = db.verifyCheckpoint("e2e-cp-1", "approved", "Looks good");
    expect(verified.verification_status).toBe("approved");
    expect(verified.verification_feedback).toBe("Looks good");
    expect(verified.verified_at).toBeTruthy();
  });

  test("activity log tracks operations", () => {
    db.logActivity({ plan_id: "e2e-plan-1", agent: "test", action: "e2e_test" });
    const log = db.getActivityLog("e2e-plan-1");
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].action).toBe("e2e_test");
  });

  test("PlanParser parses valid plan", () => {
    const raw = JSON.stringify({
      title: "Test Plan",
      items: [
        { title: "Do thing", description: "desc", executor: "deepseek" },
      ],
    });
    const plan = PlanParser.parse(raw);
    expect(plan.title).toBe("Test Plan");
    expect(plan.items.length).toBe(1);
  });

  test("MilestoneManager tracks intervals", () => {
    const mm = new MilestoneManager(2);
    // shouldCheckpoint checks DB for completed items
    // With interval=2, it should checkpoint when 2 items are completed (but not all)
    // The e2e-plan-1 has 2 items both completed, so completed < total is false
    expect(mm.shouldCheckpoint("e2e-plan-1")).toBe(false);
  });
});

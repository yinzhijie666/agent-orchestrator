import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { AgentOrchestratorPlugin } from "../index.js";
import { DB } from "../server/lib/db.js";
import KimiClient from "../server/lib/model-clients/kimi-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, "test-pr4-mock.sqlite");

let plugin;
let db;
let originalReview;

describe("PR4: User 'failed' override works with mocked Kimi failure", () => {
  beforeAll(async () => {
    await rm(TEST_DB, { force: true });
    process.env.AGENT_ORCHESTRATOR_DB_PATH = TEST_DB;
    process.env.AUTO_EXEC_DISPATCH = "false";
    process.env.OPENCODE_API_KEY = "sk-test";
    originalReview = KimiClient.prototype.reviewCheckpoint;
    KimiClient.prototype.reviewCheckpoint = async () => {
      throw new Error("mocked: 401 unauthorized");
    };
    plugin = await AgentOrchestratorPlugin({ directory: __dirname });
    db = new DB(TEST_DB);
  });

  afterAll(async () => {
    KimiClient.prototype.reviewCheckpoint = originalReview;
    if (plugin?.dispose) await plugin.dispose();
    db.close();
    await rm(TEST_DB, { force: true });
  });

  test("user 'failed' override works when Kimi returns 401", async () => {
    db.createPlan({ id: "p-mock", title: "P", plan_document: "{}", status: "active" });
    for (let i = 0; i < 4; i++) {
      db.createPlanItem({ plan_id: "p-mock", idx: i, title: `I${i}`, executor: "kimi", status: "completed" });
    }

    const createOut = await plugin.tool.agent_checkpoint.execute({ action: "create", plan_id: "p-mock" });
    expect(createOut.output).toContain("Checkpoint created");

    const verifyOut = await plugin.tool.agent_checkpoint.execute({
      action: "verify",
      plan_id: "p-mock",
      result: "failed",
    });

    expect(verifyOut.output).toContain("verified: failed");
    expect(verifyOut.output).toContain("User override");

    const cp = db.db.prepare(
      "SELECT verification_status FROM checkpoints WHERE plan_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get("p-mock");
    expect(cp.verification_status).toBe("failed");
  }, 5000);
});

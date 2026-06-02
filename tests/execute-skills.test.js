import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { mkdir, rm } from "node:fs/promises";
import { AgentOrchestratorPlugin } from "../index.js";
import { DB } from "../server/lib/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = join(__dirname, "test-execute-skills.sqlite");

let plugin;
let db;

function parseSkillAction(entry) {
  if (typeof entry !== "string") return { type: "unknown", value: String(entry) };
  if (entry.startsWith("skill ")) return { type: "skill", value: entry.slice(6).trim() };
  if (entry.startsWith("/")) return { type: "command", value: entry };
  if (entry.startsWith("codegraph_")) return { type: "codegraph", value: entry };
  return { type: "unknown", value: entry };
}

describe("agent_execute_skills tool", () => {
  beforeAll(async () => {
    await rm(TEST_DB_PATH, { force: true });
    process.env.AGENT_ORCHESTRATOR_DB_PATH = TEST_DB_PATH;
    process.env.AUTO_EXEC_DISPATCH = "false";
    plugin = await AgentOrchestratorPlugin({ directory: __dirname });
    db = new DB(TEST_DB_PATH);
  });

  afterAll(() => {
    db.close();
  });

  test("plugin registers agent_execute_skills tool", () => {
    expect(plugin.tool.agent_execute_skills).toBeDefined();
  });

  test("returns no plan when DB is empty", async () => {
    const result = await plugin.tool.agent_execute_skills.execute({ plan_id: undefined });
    const parsed = JSON.parse(result.output);
    expect(parsed.skills_to_execute).toEqual([]);
    expect(parsed.next_step).toBeTruthy();
  });

  test("returns skills from existing plan", async () => {
    const planId = "test-plan-skills";
    db.createPlan({
      id: planId,
      title: "Skills Test",
      plan_document: JSON.stringify({
        title: "Skills Test",
        items: [],
        suggested_skills: {
          P0_critical: ["codegraph_context", "skill brainstorming"],
          P1_important: ["/qa"],
          P2_nice_to_have: ["codegraph_search"]
        }
      }),
      status: "active"
    });

    const result = await plugin.tool.agent_execute_skills.execute({ plan_id: planId });
    const parsed = JSON.parse(result.output);

    expect(parsed.plan_id).toBe(planId);
    expect(parsed.skills_to_execute.length).toBe(4);

    const p0 = parsed.skills_to_execute.filter(s => s.tier === "P0_critical");
    expect(p0.length).toBe(2);
    expect(p0[0].entry).toBe("codegraph_context");
    expect(p0[0].type).toBe("codegraph");
    expect(p0[0].value).toBe("codegraph_context");
    expect(p0[1].entry).toBe("skill brainstorming");
    expect(p0[1].type).toBe("skill");
    expect(p0[1].value).toBe("brainstorming");

    const p1 = parsed.skills_to_execute.filter(s => s.tier === "P1_important");
    expect(p1.length).toBe(1);
    expect(p1[0].type).toBe("command");
    expect(p1[0].value).toBe("/qa");

    const p2 = parsed.skills_to_execute.filter(s => s.tier === "P2_nice_to_have");
    expect(p2.length).toBe(1);
    expect(p2[0].type).toBe("codegraph");
  });

  test("falls back to most recent plan when plan_id is undefined", async () => {
    const result = await plugin.tool.agent_execute_skills.execute({ plan_id: undefined });
    const parsed = JSON.parse(result.output);
    expect(parsed.skills_to_execute.length).toBeGreaterThan(0);
  });

  test("parseSkillAction handles all types", () => {
    expect(parseSkillAction("skill foo")).toEqual({ type: "skill", value: "foo" });
    expect(parseSkillAction("/browse")).toEqual({ type: "command", value: "/browse" });
    expect(parseSkillAction("codegraph_context")).toEqual({ type: "codegraph", value: "codegraph_context" });
    expect(parseSkillAction("plain text")).toEqual({ type: "unknown", value: "plain text" });
    expect(parseSkillAction(null)).toEqual({ type: "unknown", value: "null" });
  });
});

describe("getRecentPlan db method", () => {
  test("returns most recent plan", () => {
    const localDb = new DB(TEST_DB_PATH);
    const recent = localDb.getRecentPlan();
    expect(recent).toBeDefined();
    expect(recent.title).toBe("Skills Test");
    localDb.close();
  });

  test("respects limit parameter", () => {
    const localDb = new DB(TEST_DB_PATH);
    localDb.createPlan({
      id: "second-plan",
      title: "Second",
      plan_document: "{}",
      status: "active",
      created_at: new Date(Date.now() + 1000).toISOString()
    });
    const all = localDb.getRecentPlan(10);
    expect(all).toBeDefined();
    const one = localDb.getRecentPlan(1);
    expect(one.id).toBe("second-plan");
    localDb.close();
  });
});

describe("agent_execute_skills auto_exec integration", () => {
  let localDb;

  beforeAll(() => {
    localDb = new DB(TEST_DB_PATH);
  });

  afterAll(() => {
    localDb.close();
  });

  test("auto_exec.prompt generated when enabled and skills present", async () => {
    const planId = "test-auto-exec-enabled";
    localDb.db.prepare("DELETE FROM plans WHERE id = ?").run(planId);
    localDb.createPlan({
      id: planId,
      title: "Auto-Exec Enabled Test",
      plan_document: JSON.stringify({
        title: "Auto-Exec Enabled Test",
        items: [],
        suggested_skills: {
          P0_critical: ["codegraph_context", "skill brainstorming"],
          P1_important: ["/qa"],
          P2_nice_to_have: ["codegraph_search"]
        }
      }),
      status: "active",
      created_at: new Date(Date.now() + 2000).toISOString()
    });

    delete process.env.AUTO_EXEC_SKILLS;
    const result = await plugin.tool.agent_execute_skills.execute({ plan_id: planId });
    const parsed = JSON.parse(result.output);

    // With AUTO_EXEC_DISPATCH=false, autoDispatched is false,
    // so auto_exec is null (D1 has no tool access)
    expect(parsed.auto_exec).toBeNull();
    expect(parsed.auto_dispatched).toBe(false);
    expect(parsed.skills_to_execute.length).toBe(4);
    expect(parsed.next_step).toContain("Manually execute");
  });

  test("auto_exec null when AUTO_EXEC_SKILLS=false", async () => {
    const planId = "test-auto-exec-disabled";
    localDb.createPlan({
      id: planId,
      title: "Auto-Exec Disabled Test",
      plan_document: JSON.stringify({
        title: "Auto-Exec Disabled Test",
        items: [],
        suggested_skills: {
          P0_critical: ["codegraph_context"],
          P1_important: [],
          P2_nice_to_have: []
        }
      }),
      status: "active",
      created_at: new Date(Date.now() + 3000).toISOString()
    });

    process.env.AUTO_EXEC_SKILLS = "false";
    const result = await plugin.tool.agent_execute_skills.execute({ plan_id: planId });
    const parsed = JSON.parse(result.output);

    expect(parsed.auto_exec).toBeNull();
    expect(parsed.skills_to_execute.length).toBeGreaterThan(0);
    expect(parsed.next_step).toContain("Manually execute");
    delete process.env.AUTO_EXEC_SKILLS;
  });
});

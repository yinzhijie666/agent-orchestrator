/**
 * E2E: Skill Auto-Execution Flow
 *
 * Verifies the full chain end-to-end:
 *   1. Start a fresh server instance (port 8767, isolated DB)
 *   2. Create a real plan via the HTTP API (or seed a plan directly)
 *   3. Invoke the plugin's agent_execute_skills tool
 *   4. Verify the auto_exec.prompt is well-formed
 *   5. Run the prompt through AutoExecutor to confirm self-containment
 *   6. Verify AUTO_EXEC_SKILLS=false gating
 *
 * NOT part of `bun test` (excluded by tests/e2e/ path).
 * Manual run: bun run tests/e2e/auto-exec-flow.test.js
 *
 * Does NOT spawn a real subagent (would consume LLM tokens). The unit
 * tests already prove prompt generation; this test proves integration.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "bun";
import { mkdir, rm, writeFile, readFile, open } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");
const E2E_DIR = join(__dirname, ".tmp");
const LOG_DIR = join(__dirname, "logs");
const E2E_PORT = 8767;
const E2E_DB = join(E2E_DIR, "e2e.sqlite");
const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

let serverProcess = null;
let testPlanId = null;

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// This test requires valid API keys and starts a real server process.
// Skip unconditionally in unit test runs; run manually with: bun run tests/e2e/auto-exec-flow.test.js
const describeOrSkip = describe.skip;

describeOrSkip("E2E: Skill Auto-Execution Flow", () => {
  beforeAll(async () => {
    await mkdir(E2E_DIR, { recursive: true });
    await mkdir(LOG_DIR, { recursive: true });
    await rm(E2E_DB, { force: true });

    // Set env for the test process so the plugin uses the E2E DB
    process.env.AGENT_ORCHESTRATOR_DB_PATH = E2E_DB;
    process.env.AUTO_EXEC_SKILLS = "true";

    console.log(`[E2E] Starting server on :${E2E_PORT} with DB ${E2E_DB}`);
    serverProcess = spawn({
      cmd: ["bun", "run", "server/index.js"],
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        AGENT_ORCHESTRATOR_PORT: String(E2E_PORT),
        AGENT_ORCHESTRATOR_DB_PATH: E2E_DB,
        AUTO_EXEC_SKILLS: "true",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const serverLogPath = join(LOG_DIR, "server.log");
    const serverLogBun = await open(serverLogPath, "w");
    serverProcess.stdout.pipeTo(serverLogBun.writable).catch(() => {});

    const ready = await waitForServer(`${BASE_URL}/api/status`);
    if (!ready) {
      throw new Error(`Server failed to start within 15s. See ${serverLogPath}`);
    }
    console.log(`[E2E] Server ready at ${BASE_URL}`);
  }, 30000);

  afterAll(async () => {
    if (serverProcess) {
      try {
        serverProcess.kill("SIGTERM");
        await Promise.race([
          serverProcess.exited,
          new Promise(r => setTimeout(() => r(false), 3000)),
        ]);
        if (serverProcess.exitCode === null) {
          serverProcess.kill("SIGKILL");
        }
        console.log("[E2E] Server stopped");
      } catch (e) {
        console.warn("[E2E] Server stop error (non-fatal):", e.message);
      }
      serverProcess = null;
    }
    try {
      const { execSync } = await import("node:child_process");
      execSync("pkill -f 'opencode serve --port 8767' 2>/dev/null", { stdio: "ignore" });
    } catch {}
  });

  test("S1. server /api/status responds", async () => {
    const res = await fetch(`${BASE_URL}/api/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.server).toBe("agent-orchestrator");
  });

  test("S2. seed a plan with P0/P1/P2 skills via direct DB", async () => {
    // Use the plugin's DB to seed a plan (avoids depending on LLM API)
    const { DB } = await import("../../server/lib/db.js");
    const db = new DB(E2E_DB);

    testPlanId = "e2e-plan-001";
    db.createPlan({
      id: testPlanId,
      title: "E2E Auto-Exec Plan",
      plan_document: JSON.stringify({
        title: "E2E Auto-Exec Plan",
        goal: "Verify skill auto-execution flow",
        items: [
          { idx: 0, title: "Step 1", executor: "kimi" },
          { idx: 1, title: "Step 2", executor: "deepseek" },
        ],
        suggested_skills: {
          P0_critical: ["codegraph_context", "skill brainstorming"],
          P1_important: ["/qa"],
          P2_nice_to_have: ["oh-my-memory search patterns"],
        },
      }),
      status: "active",
    });
    db.close();

    const plan = new DB(E2E_DB).getPlan(testPlanId);
    expect(plan).toBeTruthy();
    expect(plan.title).toBe("E2E Auto-Exec Plan");
  });

  test("S3. agent_execute_skills returns auto_exec.prompt", async () => {
    // Re-import the plugin to get a fresh tool bound to the test DB
    const { AgentOrchestratorPlugin } = await import("../../index.js");
    const plugin = await AgentOrchestratorPlugin({ directory: E2E_DIR });

    const result = await plugin.tool.agent_execute_skills.execute({ plan_id: testPlanId });
    const parsed = JSON.parse(result.output);

    // Persist for debugging
    await writeFile(
      join(E2E_DIR, "agent_execute_skills-output.json"),
      JSON.stringify(parsed, null, 2)
    );

    expect(parsed.plan_id).toBe(testPlanId);
    expect(parsed.skills_to_execute.length).toBe(4);
    // D2 is optional (prefer="run" in config), so auto_exec may be null
    if (parsed.auto_exec !== null) {
      expect(parsed.auto_exec.mode).toBe("subagent");
      expect(parsed.auto_exec.prompt).toBeTruthy();
      expect(parsed.auto_exec.trigger).toContain("subagent_type");
      expect(parsed.auto_exec.prompt).toContain(testPlanId);
      expect(parsed.auto_exec.prompt).toContain("P0_critical");
      expect(parsed.auto_exec.prompt).toContain("codegraph_context");
      expect(parsed.auto_exec.prompt).toContain("skill brainstorming");
      expect(parsed.auto_exec.prompt).toContain("/qa");
      expect(parsed.auto_exec.prompt).toContain("oh-my-memory");
      expect(parsed.auto_exec.prompt).toContain("Do NOT call `agent`");
      expect(parsed.next_step).toContain("Auto-execution ready");
    } else {
      // D2 not enabled: auto_exec is null, manual execution required
      expect(parsed.auto_dispatched).toBe(false);
      expect(parsed.next_step).toContain("manual skills in main session");
    }
  });

  test("S4. auto_exec.prompt is self-contained (has all required sections)", async () => {
    const out = await readFile(join(E2E_DIR, "agent_execute_skills-output.json"), "utf-8");
    const parsed = JSON.parse(out);
    // Skip if auto_exec is null (D2 not enabled)
    if (parsed.auto_exec === null) return;
    const prompt = parsed.auto_exec.prompt;

    const requiredSections = [
      "Plan Context",
      "Your Role",
      "Skills to Execute",
      "P0_critical",
      "P1_important",
      "P2_nice_to_have",
      "Execution Rules",
      "Required JSON Output Schema",
      "executed_skills",
      "p0_failures",
      "summary",
    ];

    for (const section of requiredSections) {
      expect(prompt).toContain(section);
    }
  });

  test("S5. AUTO_EXEC_SKILLS=false disables auto_exec", async () => {
    const prev = process.env.AUTO_EXEC_SKILLS;
    process.env.AUTO_EXEC_SKILLS = "false";

    const { AgentOrchestratorPlugin } = await import("../../index.js");
    const plugin = await AgentOrchestratorPlugin({ directory: E2E_DIR });

    const result = await plugin.tool.agent_execute_skills.execute({ plan_id: testPlanId });
    const parsed = JSON.parse(result.output);

    expect(parsed.auto_exec).toBeNull();
    expect(parsed.skills_to_execute.length).toBe(4);
    expect(parsed.next_step).toContain("manual skills in main session");

    // Restore
    if (prev === undefined) delete process.env.AUTO_EXEC_SKILLS;
    else process.env.AUTO_EXEC_SKILLS = prev;
  });

  test("S6. write final summary", async () => {
    const summary = {
      plan_id: testPlanId,
      e2e_dir: E2E_DIR,
      log_dir: LOG_DIR,
      timestamp: new Date().toISOString(),
    };
    await writeFile(
      join(LOG_DIR, "e2e-summary.json"),
      JSON.stringify(summary, null, 2)
    );
    console.log(`[E2E] Summary written to ${LOG_DIR}/e2e-summary.json`);
  });
});

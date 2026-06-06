import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { WorkflowValidator, WORKFLOW_PHASES, ALL_REQUIRED_SKILLS } from "../server/lib/workflow-validator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, ".tmp-workflow-test");

describe("WorkflowValidator", () => {
  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    // Create mock files for Phase 1 checks
    await mkdir(join(TEST_DIR, "graphify-out"), { recursive: true });
    await writeFile(join(TEST_DIR, "graphify-out", "graph.json"), '{"nodes":[],"edges":[]}');
    await mkdir(join(TEST_DIR, ".understand-anything"), { recursive: true });
    await writeFile(join(TEST_DIR, ".understand-anything", "knowledge-graph.json"), '{"nodes":[],"edges":[]}');
    await mkdir(join(TEST_DIR, ".codegraph"), { recursive: true });
    await writeFile(join(TEST_DIR, ".codegraph", "codegraph.db"), "");
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("WORKFLOW_PHASES constant", () => {
    test("phase1 has 4 steps", () => {
      expect(WORKFLOW_PHASES.phase1.length).toBe(4);
    });

    test("phase2 has 31 skills total", () => {
      const total = WORKFLOW_PHASES.phase2.karpathy.length
        + WORKFLOW_PHASES.phase2.superpowers.length
        + WORKFLOW_PHASES.phase2.gstack.length;
      expect(total).toBe(31);
    });

    test("phase3 has 24 tools total", () => {
      const total = WORKFLOW_PHASES.phase3.understand.length
        + WORKFLOW_PHASES.phase3.codegraph.length
        + WORKFLOW_PHASES.phase3.graphify.length;
      expect(total).toBe(24);
    });
  });

  describe("ALL_REQUIRED_SKILLS", () => {
    test("contains 31 skills", () => {
      expect(ALL_REQUIRED_SKILLS.length).toBe(31);
    });

    test("includes Karpathy", () => {
      expect(ALL_REQUIRED_SKILLS).toContain("andrej-karpathy");
    });

    test("includes all Superpowers", () => {
      expect(ALL_REQUIRED_SKILLS).toContain("brainstorming");
      expect(ALL_REQUIRED_SKILLS).toContain("writing-plans");
      expect(ALL_REQUIRED_SKILLS).toContain("test-driven-development");
      expect(ALL_REQUIRED_SKILLS).toContain("systematic-debugging");
      expect(ALL_REQUIRED_SKILLS).toContain("verification-before-completion");
    });

    test("includes all GStack", () => {
      expect(ALL_REQUIRED_SKILLS).toContain("browse");
      expect(ALL_REQUIRED_SKILLS).toContain("qa");
      expect(ALL_REQUIRED_SKILLS).toContain("review");
      expect(ALL_REQUIRED_SKILLS).toContain("ship");
    });
  });

  describe("checkPhase1", () => {
    test("detects all Phase 1 files", () => {
      const result = WorkflowValidator.checkPhase1(TEST_DIR);
      expect(result.passed).toBe(3); // p1-4 is optional
      expect(result.total).toBe(4);
      expect(result.details[0].status).toBe("completed");
      expect(result.details[1].status).toBe("completed");
      expect(result.details[2].status).toBe("completed");
      expect(result.details[3].status).toBe("optional");
    });

    test("reports missing files", () => {
      const result = WorkflowValidator.checkPhase1("/nonexistent");
      expect(result.passed).toBe(0);
      expect(result.details[0].status).toBe("missing");
    });
  });

  describe("checkPhase2", () => {
    test("reports all skills loaded", () => {
      const result = WorkflowValidator.checkPhase2(ALL_REQUIRED_SKILLS);
      expect(result.passed).toBe(31);
      expect(result.missing).toEqual([]);
    });

    test("reports missing skills", () => {
      const result = WorkflowValidator.checkPhase2(["brainstorming"]);
      expect(result.passed).toBe(1);
      expect(result.missing.length).toBe(30);
      expect(result.missing).toContain("andrej-karpathy");
    });
  });

  describe("checkPhase3", () => {
    test("detects available tools", () => {
      const result = WorkflowValidator.checkPhase3(TEST_DIR);
      expect(result.passed).toBeGreaterThan(0);
      expect(result.total).toBe(24);
    });
  });

  describe("generateReport", () => {
    test("returns complete report", () => {
      const report = WorkflowValidator.generateReport(TEST_DIR, ALL_REQUIRED_SKILLS);
      expect(report.phase1).toBeDefined();
      expect(report.phase2).toBeDefined();
      expect(report.phase3).toBeDefined();
      expect(report.summary).toContain("工作流完成度");
      expect(report.completionRate).toBeGreaterThan(0);
    });
  });

  describe("formatReport", () => {
    test("returns markdown string", () => {
      const report = WorkflowValidator.generateReport(TEST_DIR, ALL_REQUIRED_SKILLS);
      const formatted = WorkflowValidator.formatReport(report);
      expect(formatted).toContain("📊 完整工作流状态");
      expect(formatted).toContain("Phase 1");
      expect(formatted).toContain("Phase 2");
      expect(formatted).toContain("Phase 3");
    });
  });
});

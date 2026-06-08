import { describe, test, expect } from "bun:test";
import { AutoExecutor } from "../server/lib/auto-executor.js";

const PLAN_CTX = {
  planId: "plan-42",
  title: "Test Plan",
  goal: "Test the auto-executor",
};

describe("AutoExecutor.buildPrompt", () => {
  test("includes P0 before P1", () => {
    const skills = [
      { tier: "P1_important", entry: "/qa", type: "command", value: "/qa" },
      { tier: "P0_critical", entry: "codegraph_context", type: "codegraph", value: "codegraph_context" },
    ];
    const result = AutoExecutor.buildPrompt(skills, PLAN_CTX);
    const prompt = result.prompt;
    const p0Idx = prompt.indexOf("P0 (BLOCKING");
    const p1Idx = prompt.indexOf("P1 (Sequential");
    expect(p0Idx).toBeGreaterThan(-1);
    expect(p1Idx).toBeGreaterThan(p0Idx);
  });

  test("excludes empty tiers", () => {
    const skills = [
      { tier: "P0_critical", entry: "codegraph_context", type: "codegraph", value: "codegraph_context" },
    ];
    const result = AutoExecutor.buildPrompt(skills, PLAN_CTX);
    const prompt = result.prompt;
    expect(prompt).toContain("P0 (BLOCKING");
    expect(prompt).not.toContain("P1 (Sequential");
    expect(prompt).not.toContain("P2 (May be skipped");
  });

  test("includes plan context (id, title, goal)", () => {
    const skills = [
      { tier: "P0_critical", entry: "codegraph_context", type: "codegraph", value: "codegraph_context" },
    ];
    const result = AutoExecutor.buildPrompt(skills, PLAN_CTX);
    const prompt = result.prompt;
    expect(prompt).toContain("Plan ID: plan-42");
    expect(prompt).toContain("Title: Test Plan");
    expect(prompt).toContain("Goal: Test the auto-executor");
  });

  test("forbids recursive dispatch", () => {
    const skills = [
      { tier: "P0_critical", entry: "codegraph_context", type: "codegraph", value: "codegraph_context" },
    ];
    const result = AutoExecutor.buildPrompt(skills, PLAN_CTX);
    const prompt = result.prompt;
    expect(prompt).toContain("Do NOT call `agent`");
    expect(prompt).toContain("recursion prevention");
    expect(prompt).toContain("agent_execute_skills");
  });

  test("includes JSON output schema", () => {
    const skills = [
      { tier: "P0_critical", entry: "codegraph_context", type: "codegraph", value: "codegraph_context" },
    ];
    const result = AutoExecutor.buildPrompt(skills, PLAN_CTX);
    const prompt = result.prompt;
    expect(prompt).toContain('"plan_id"');
    expect(prompt).toContain('"executed_skills"');
    expect(prompt).toContain('"p0_failures"');
    expect(prompt).toContain('"summary"');
  });
});

describe("AutoExecutor.generateInstruction", () => {
  test("maps skill type", () => {
    const inst = AutoExecutor.generateInstruction({
      tier: "P0_critical",
      entry: "skill brainstorming",
      type: "skill",
      value: "brainstorming",
    });
    expect(inst).toContain('skill');
    expect(inst).toContain('brainstorming');
  });

  test("maps command type", () => {
    const inst = AutoExecutor.generateInstruction({
      tier: "P0_critical",
      entry: "/qa",
      type: "command",
      value: "/qa",
    });
    expect(inst).toContain("/qa");
    expect(inst.toLowerCase()).toContain("skill.md");
  });

  test("maps codegraph type", () => {
    const inst = AutoExecutor.generateInstruction({
      tier: "P0_critical",
      entry: "codegraph_context",
      type: "codegraph",
      value: "codegraph_context",
    });
    expect(inst).toContain("codegraph_context");
    expect(inst.toLowerCase()).toContain("mcp");
  });

  test("maps memory type", () => {
    const inst = AutoExecutor.generateInstruction({
      tier: "P0_critical",
      entry: "oh-my-memory search patterns",
      type: "memory",
      value: "oh-my-memory search patterns",
    });
    expect(inst.toLowerCase()).toContain("oh-my-memory");
  });

  test("maps unknown type with fallback", () => {
    const inst = AutoExecutor.generateInstruction({
      tier: "P0_critical",
      entry: "random-tool-xyz",
      type: "unknown",
      value: "random-tool-xyz",
    });
    expect(inst).toContain("random-tool-xyz");
    expect(inst.toLowerCase()).toContain("skip");
  });
});

describe("AutoExecutor.validate", () => {
  test("filters null entries", () => {
    const input = [
      null,
      { tier: "P0_critical", entry: "codegraph_context", type: "codegraph", value: "codegraph_context" },
      undefined,
      { tier: "P1_important", entry: "/qa", type: "command", value: "/qa" },
    ];
    const cleaned = AutoExecutor.validate(input);
    expect(cleaned.length).toBe(2);
    expect(cleaned[0].entry).toBe("codegraph_context");
  });

  test("validates all skills without truncation", () => {
    const input = Array.from({ length: 25 }, (_, i) => ({
      tier: "P2_nice_to_have",
      entry: `skill${i}`,
      type: "skill",
      value: `skill${i}`,
    }));
    const cleaned = AutoExecutor.validate(input);
    expect(cleaned.length).toBe(25);
  });

  test("normalizes invalid tier to P2", () => {
    const input = [
      { tier: "INVALID_TIER", entry: "codegraph_context", type: "codegraph", value: "codegraph_context" },
    ];
    const cleaned = AutoExecutor.validate(input);
    expect(cleaned[0].tier).toBe("P2");
  });

  test("normalizes invalid type to unknown", () => {
    const input = [
      { tier: "P0_critical", entry: "weird", type: "weird_type", value: "weird" },
    ];
    const cleaned = AutoExecutor.validate(input);
    expect(cleaned[0].type).toBe("unknown");
  });

  test("returns empty array for non-array input", () => {
    expect(AutoExecutor.validate(null)).toEqual([]);
    expect(AutoExecutor.validate(undefined)).toEqual([]);
    expect(AutoExecutor.validate("string")).toEqual([]);
    expect(AutoExecutor.validate({})).toEqual([]);
  });

  test("drops entries with empty entry string", () => {
    const input = [
      { tier: "P0_critical", entry: "", type: "codegraph", value: "" },
      { tier: "P0_critical", entry: "codegraph_context", type: "codegraph", value: "codegraph_context" },
    ];
    const cleaned = AutoExecutor.validate(input);
    expect(cleaned.length).toBe(1);
    expect(cleaned[0].entry).toBe("codegraph_context");
  });
});

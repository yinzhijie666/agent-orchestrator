import { describe, test, expect } from "bun:test";
import { SkillClassifier, createDefaultClassifier } from "../server/lib/skill-classifier.js";

describe("SkillClassifier", () => {
  const classifier = createDefaultClassifier();

  test("classifies all 31 skills without UNKNOWN", () => {
    const all = classifier.classifyAll();
    const names = Object.keys(all);
    expect(names.length).toBe(31);
    for (const [name, result] of Object.entries(all)) {
      expect(result.category).not.toBe('UNKNOWN');
    }
  });

  test("INTERACTIVE skills (7) are correctly identified", () => {
    const interactive = classifier.getByCategory('INTERACTIVE');
    expect(interactive).toContain('brainstorming');
    expect(interactive).toContain('finishing-a-development-branch');
    expect(interactive).toContain('using-git-worktrees');
    expect(interactive).toContain('receiving-code-review');
    expect(interactive).toContain('executing-plans');
    expect(interactive).toContain('subagent-driven-development');
    expect(interactive).toContain('design-consultation');
    expect(interactive.length).toBe(7);
  });

  test("TOOL_REQUIRED skills (10) are correctly identified", () => {
    const toolRequired = classifier.getByCategory('TOOL_REQUIRED');
    expect(toolRequired).toContain('browse');
    expect(toolRequired).toContain('qa');
    expect(toolRequired).toContain('qa-only');
    expect(toolRequired).toContain('design-review');
    expect(toolRequired).toContain('setup-browser-cookies');
    expect(toolRequired).toContain('verification-before-completion');
    expect(toolRequired).toContain('systematic-debugging');
    expect(toolRequired).toContain('debug');
    expect(toolRequired).toContain('ship');
    expect(toolRequired).toContain('test-driven-development');
    expect(toolRequired.length).toBe(10);
  });

  test("AUTO skills (14) are correctly identified", () => {
    const auto = classifier.getByCategory('AUTO');
    expect(auto).toContain('andrej-karpathy');
    expect(auto).toContain('writing-plans');
    expect(auto).toContain('requesting-code-review');
    expect(auto).toContain('dispatching-parallel-agents');
    expect(auto).toContain('using-superpowers');
    expect(auto).toContain('writing-skills');
    expect(auto).toContain('document-release');
    expect(auto).toContain('gstack-upgrade');
    expect(auto).toContain('office-hours');
    expect(auto).toContain('plan-ceo-review');
    expect(auto).toContain('plan-design-review');
    expect(auto).toContain('plan-eng-review');
    expect(auto).toContain('retro');
    expect(auto).toContain('review');
    expect(auto.length).toBe(14);
  });

  test("total is 31", () => {
    const interactive = classifier.getByCategory('INTERACTIVE');
    const toolRequired = classifier.getByCategory('TOOL_REQUIRED');
    const auto = classifier.getByCategory('AUTO');
    expect(interactive.length + toolRequired.length + auto.length).toBe(31);
  });

  test("memory type is classified as TOOL_REQUIRED", () => {
    const result = classifier.classify("oh-my-memory search patterns", "", "memory");
    expect(result.category).toBe("TOOL_REQUIRED");
    expect(result.reason).toContain("memory type requires MCP tool access");
  });

  test("unknown type without SKILL.md defaults to AUTO", () => {
    const result = classifier.classify("some-random-skill", "/nonexistent/path/SKILL.md");
    expect(result.category).toBe("AUTO");
  });
});

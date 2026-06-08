import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { ALL_REQUIRED_SKILLS } from "../server/lib/workflow-validator.js";
import { createDefaultClassifier } from "../server/lib/skill-classifier.js";

describe("SkillClassifier reachability", () => {
  const classifier = createDefaultClassifier();

  test("all 31 SKILL.md files exist", () => {
    for (const entry of classifier.skillEntries) {
      expect(existsSync(entry.path)).toBe(true);
    }
    expect(classifier.skillEntries.length).toBe(31);
  });

  test("all 31 skills classifiable without fallback to AUTO", () => {
    const results = classifier.classifyAll();
    const autoFallback = Object.entries(results)
      .filter(([, v]) => v.reason.includes('SKILL.md not found'));
    expect(autoFallback.length).toBe(0);
  });

  test("ALL_REQUIRED_SKILLS matches classifier entries", () => {
    const classifierNames = classifier.skillEntries.map(e => e.name).sort();
    const requiredNames = [...ALL_REQUIRED_SKILLS].sort();
    expect(classifierNames).toEqual(requiredNames);
  });
});

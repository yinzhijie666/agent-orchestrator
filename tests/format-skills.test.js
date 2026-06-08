import { describe, test, expect } from "bun:test";

// formatSuggestedSkills is internal to index.js; it's not exported directly.
// We access it through the module's internal scope.
// Since it's not exported, this import will fail unless we add an export.
import { formatSuggestedSkills } from "../index.js";

describe("formatSuggestedSkills", () => {
  test("returns '' for null/undefined", () => {
    expect(formatSuggestedSkills(null)).toBe("");
    expect(formatSuggestedSkills(undefined)).toBe("");
  });

  test("returns '' for empty object", () => {
    expect(formatSuggestedSkills({})).toBe("");
  });

  test("returns '' for object with empty arrays", () => {
    expect(formatSuggestedSkills({ P0_critical: [], P1_important: [], P2_nice_to_have: [] })).toBe("");
  });

  test("formats P0 items correctly", () => {
    const result = formatSuggestedSkills({
      P0_critical: ["codegraph_context", "codegraph_search"],
    });
    expect(result).toContain("💡 建议后续");
    expect(result).toContain("P0 (必选)");
    expect(result).toContain("codegraph_context");
    expect(result).toContain("codegraph_search");
    expect(result).not.toContain("P1");
    expect(result).not.toContain("P2");
  });

  test("formats all three priority levels", () => {
    const result = formatSuggestedSkills({
      P0_critical: ["a"],
      P1_important: ["b", "c"],
      P2_nice_to_have: ["d", "e", "f"],
    });
    expect(result).toContain("P0 (必选)");
    expect(result).toContain("P1 (推荐)");
    expect(result).toContain("P2 (可选)");
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
    expect(result).toContain("d");
    expect(result).toContain("e");
    expect(result).toContain("f");
  });

  test("returns '' for non-object input", () => {
    expect(formatSuggestedSkills("string")).toBe("");
    expect(formatSuggestedSkills(123)).toBe("");
    expect(formatSuggestedSkills([])).toBe("");
  });
});

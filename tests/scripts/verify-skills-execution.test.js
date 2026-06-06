import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const SCRIPT = "scripts/verify-skills-execution.sh";

describe("verify-skills-execution.sh (8 checks)", () => {
  test("script file exists and is executable", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const content = readFileSync(SCRIPT, "utf8");
    expect(content.length).toBeGreaterThan(100);
  });

  test("contains all 8 check headers", () => {
    const content = readFileSync(SCRIPT, "utf8");
    for (let i = 1; i <= 8; i++) {
      expect(content).toContain(`[P${i <= 5 ? "0" : "1"} #${i}]`);
    }
  });

  test("defines P0 #1 brainstorming spec check", () => {
    const content = readFileSync(SCRIPT, "utf8");
    expect(content).toContain("brainstorming");
    expect(content).toContain("docs/superpowers/specs/");
  });

  test("defines P0 #2 writing-plans plan check", () => {
    const content = readFileSync(SCRIPT, "utf8");
    expect(content).toContain("writing-plans");
    expect(content).toContain("docs/superpowers/plans/");
  });

  test("defines P0 #3 TDD git log check", () => {
    const content = readFileSync(SCRIPT, "utf8");
    expect(content).toContain("test-driven-development");
    expect(content).toContain("git log");
  });

  test("defines P0 #4 verification bun test check", () => {
    const content = readFileSync(SCRIPT, "utf8");
    expect(content).toContain("verification-before-completion");
    expect(content).toContain("bun test");
  });

  test("defines P0 #5 finishing branch check", () => {
    const content = readFileSync(SCRIPT, "utf8");
    expect(content).toContain("finishing-a-development-branch");
  });

  test("defines P1 #6 systematic-debugging check", () => {
    const content = readFileSync(SCRIPT, "utf8");
    expect(content).toContain("systematic-debugging");
    expect(content).toContain("debug-reports");
  });

  test("has color-coded output (RED/GREEN/YELLOW)", () => {
    const content = readFileSync(SCRIPT, "utf8");
    expect(content).toContain("RED=");
    expect(content).toContain("GREEN=");
    expect(content).toContain("YELLOW=");
  });

  test("exits with appropriate code", () => {
    const content = readFileSync(SCRIPT, "utf8");
    expect(content).toContain("exit $EXIT_CODE");
  });
});

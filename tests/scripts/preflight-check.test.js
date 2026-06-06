import { describe, test, expect, beforeAll } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const SCRIPT = "scripts/workflow-preflight-check.sh";
let result = "";
let exitCode = 0;

beforeAll(() => {
  try {
    result = execSync(`bash ${SCRIPT}`, {
      encoding: "utf8",
      timeout: 60000,
      cwd: process.cwd(),
    });
  } catch (err) {
    result = err.stdout + err.stderr;
    exitCode = err.status || 1;
  }
}, 60000);

describe("workflow-preflight-check.sh (11 checks)", () => {
  test("runs with appropriate exit code", () => {
    // When knowledge-graph.json doesn't exist, exit code is 1
    // When it exists, exit code is 0
    expect(exitCode).toBeGreaterThanOrEqual(0);
    expect(exitCode).toBeLessThanOrEqual(1);
  });

  test("outputs check results", () => {
    // Should contain either "✅ 所有检查通过" or "❌ 存在错误"
    expect(result).toMatch(/检查结果|检查通过|存在错误|存在警告/);
  });

  test("outputs all check headers", () => {
    expect(result).toContain("[1/11]");
    expect(result).toContain("[7/11]");
    expect(result).toContain("/understand knowledge graph");
    expect(result).toContain("[8/11]");
    expect(result).toContain("[10/11]");
  });

  test("reports 31 skills correctly", () => {
    expect(result).toContain("Karpathy: 1/1");
    expect(result).toContain("Superpowers: 14/14");
    expect(result).toContain("GStack: 16/16");
  });

  test("reports CodeGraph CLI 16 commands available", () => {
    expect(result).toContain("16 个 CLI 命令全部可用");
  });

  test("/understand check behavior matches knowledge-graph.json existence", () => {
    const kgExists = existsSync(".understand-anything/knowledge-graph.json");
    if (kgExists) {
      expect(result).toContain("✅");
      expect(exitCode).toBe(0);
    } else {
      expect(result).toContain("❌");
      expect(exitCode).toBe(1);
    }
  });
});

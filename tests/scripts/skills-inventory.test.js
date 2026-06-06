import { describe, test, expect, beforeAll } from "bun:test";
import { execSync } from "node:child_process";

const SCRIPT = "scripts/skills-inventory.sh";
let result = "";

beforeAll(() => {
  result = execSync(`bash ${SCRIPT}`, {
    encoding: "utf8",
    timeout: 60000,
    cwd: process.cwd(),
  });
}, 60000);

describe("skills-inventory.sh", () => {
  test("reports 31 / 31 found", () => {
    expect(result).toContain("31 / 31");
    expect(result).toContain("31 skills 全部健康");
  });

  test("lists Karpathy, Superpowers, GStack sections", () => {
    expect(result).toContain("[Karpathy - 1]");
    expect(result).toContain("[Superpowers - 14]");
    expect(result).toContain("[GStack - 16]");
  });

  test("all 31 entries show ✅", () => {
    const checkCount = (result.match(/✅/g) || []).length;
    expect(checkCount).toBeGreaterThanOrEqual(31);
  });

  test("reports 0 missing", () => {
    expect(result).toContain("缺失: 0");
  });
});

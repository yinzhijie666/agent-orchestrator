import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";

const SCRIPT = "scripts/codegraph-capability-matrix.sh";
const OUT = "docs/CODEGRAPH-CAPABILITY-MATRIX.json";
let matrixData = null;

beforeAll(() => {
  const result = execSync(`bash ${SCRIPT} ${OUT}`, {
    encoding: "utf8",
    timeout: 60000,
    cwd: process.cwd(),
  });
  if (existsSync(OUT)) {
    matrixData = JSON.parse(readFileSync(OUT, "utf8"));
  }
}, 60000);

afterAll(() => {
  if (existsSync(OUT)) unlinkSync(OUT);
});

describe("codegraph-capability-matrix.sh", () => {
  test("generates valid JSON with correct schema", { timeout: 10000 }, () => {
    expect(matrixData).not.toBeNull();
    expect(matrixData).toHaveProperty("tool", "codegraph");
    expect(matrixData).toHaveProperty("version");
    expect(matrixData).toHaveProperty("cli");
    expect(matrixData).toHaveProperty("mcp");
    expect(matrixData).toHaveProperty("gaps");
  });

  test("reports 16 CLI commands", () => {
    expect(matrixData.cli.count).toBe(16);
    expect(matrixData.cli.commands).toHaveLength(16);
  });

  test("reports 5 MCP tools", () => {
    expect(matrixData.mcp.count).toBe(5);
    expect(matrixData.mcp.tools).toHaveLength(5);
  });

  test("reports correct gaps (3 MCP-exclusive, 19 total)", () => {
    expect(matrixData.gaps.mcp_exclusive_count).toBe(3);
    expect(matrixData.gaps.total_capabilities).toBe(19);
  });
});

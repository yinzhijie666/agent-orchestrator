import { describe, test, expect, beforeEach } from "bun:test";
import { rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, "test-lazy-db.sqlite");

describe("DB lazy loading", () => {
  beforeEach(async () => {
    await rm(TEST_DB, { force: true });
  });

  test("importing db does not open database file", async () => {
    process.env.AGENT_ORCHESTRATOR_DB_PATH = TEST_DB;
    await rm(TEST_DB, { force: true });
    await import("../server/lib/db.js?nocache=" + Date.now());
    expect(existsSync(TEST_DB)).toBe(false);
  });

  test("getDefaultDB returns a singleton", () => {
    process.env.AGENT_ORCHESTRATOR_DB_PATH = TEST_DB;
    const { getDefaultDB } = require("../server/lib/db.js");
    const a = getDefaultDB();
    const b = getDefaultDB();
    expect(a).toBe(b);
  });
});

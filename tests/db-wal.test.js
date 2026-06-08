import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";

describe("Database WAL mode", () => {
  let tmpDir;
  let dbPath;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "db-wal-test-"));
    dbPath = join(tmpDir, "test.db");
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("WAL mode can be set on database initialization", () => {
    const db = new Database(dbPath, { create: true });
    db.exec("PRAGMA journal_mode=WAL");
    const row = db.prepare("PRAGMA journal_mode").get();
    db.close();
    expect(row).toBeTruthy();
    const mode = Object.values(row)[0];
    expect(String(mode).toLowerCase()).toBe("wal");
  });

  test("WAL mode persists after connection close (setting is stored in DB file)", () => {
    const db = new Database(dbPath);
    const row = db.prepare("PRAGMA journal_mode").get();
    db.close();
    const mode = Object.values(row)[0];
    expect(String(mode).toLowerCase()).toBe("wal");
  });
});

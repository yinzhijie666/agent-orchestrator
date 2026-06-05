import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/lib/db-migrate.js";
import { SCHEMA_SQL } from "../server/lib/db-schema.js";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

const TEST_DB = join(__dirname, "test-migrate.sqlite");

function freshDb() {
  try { unlinkSync(TEST_DB); } catch {}
  const db = new Database(TEST_DB);
  db.exec(SCHEMA_SQL);
  return db;
}

describe("db-migrate", () => {
  test("creates _migrations table and records baseline version", () => {
    const db = freshDb();
    runMigrations(db);
    const migrations = db.prepare("SELECT * FROM _migrations").all();
    expect(migrations.length).toBeGreaterThanOrEqual(1);
    expect(migrations[0].name).toBe("initial_schema");
    db.close();
    unlinkSync(TEST_DB);
  });

  test("skips already-applied migrations", () => {
    const db = freshDb();
    runMigrations(db);
    const before = db.prepare("SELECT COUNT(*) as c FROM _migrations").get().c;
    runMigrations(db); // run again
    const after = db.prepare("SELECT COUNT(*) as c FROM _migrations").get().c;
    expect(after).toBe(before);
    db.close();
    unlinkSync(TEST_DB);
  });

  test("existing tables preserved after migration", () => {
    const db = freshDb();
    db.prepare("INSERT INTO plans (id, title, plan_document) VALUES (?, ?, ?)").run("p1", "Test", "{}");
    runMigrations(db);
    const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get("p1");
    expect(plan.title).toBe("Test");
    db.close();
    unlinkSync(TEST_DB);
  });
});

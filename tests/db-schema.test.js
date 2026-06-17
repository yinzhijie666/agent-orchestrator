import { describe, test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { SCHEMA_SQL } from "../server/lib/db-schema.js";

describe("SCHEMA_SQL single source of truth", () => {
  test("contains all 7 expected tables", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((t) => t.name);
    expect(tables).toContain("activity_log");
    expect(tables).toContain("agent_threads");
    expect(tables).toContain("checkpoints");
    expect(tables).toContain("messages");
    expect(tables).toContain("model_stats");
    expect(tables).toContain("plan_items");
    expect(tables).toContain("plans");
    db.close();
  });

  test("plans table has required columns", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    const cols = db.query("PRAGMA table_info(plans)").all();
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "title",
        "plan_document",
        "status",
        "created_at",
        "completed_at",
        "milestones_total",
        "milestones_completed",
        "fallback_used",
      ])
    );
    db.close();
  });

  test("plan_items has foreign key to plans", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    const fks = db.query("PRAGMA foreign_key_list(plan_items)").all();
    expect(fks.length).toBeGreaterThan(0);
    expect(fks[0].table).toBe("plans");
    db.close();
  });

  test("is idempotent (CREATE IF NOT EXISTS)", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
    db.close();
  });
});

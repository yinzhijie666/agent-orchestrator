import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { SCHEMA_SQL } from "../server/lib/db-schema.js";
import { DB } from "../server/lib/db.js";
import BaseModelClient from "../server/lib/model-clients/base-client.js";
import DeepSeekClient from "../server/lib/model-clients/deepseek-client.js";
import { SubagentRunner } from "../server/lib/subagent-runner.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unlinkSync, existsSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("model_stats schema", () => {
  test("model_stats table is created by SCHEMA_SQL", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((t) => t.name);
    expect(tables).toContain("model_stats");
    db.close();
  });

  test("model_stats has required columns", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    const cols = db.query("PRAGMA table_info(model_stats)").all();
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(["id", "model", "provider", "duration_ms", "success", "timestamp"])
    );
    db.close();
  });

  test("SCHEMA_SQL is idempotent with model_stats", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
    db.close();
  });
});

describe("DB model_stats methods", () => {
  let dbPath;
  let db;

  beforeEach(() => {
    dbPath = join(__dirname, "test-model-stats.sqlite");
    if (existsSync(dbPath)) unlinkSync(dbPath);
    const sqlite = new Database(dbPath, { create: true });
    sqlite.exec(SCHEMA_SQL);
    sqlite.close();
    db = new DB(dbPath);
  });

  afterEach(() => {
    if (db) db.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  test("logModelCall inserts a row", () => {
    db.logModelCall("deepseek", "deepseek", 150, true);
    db.logModelCall("opencode-zen", "opencode-zen", 200, true);
    const counts = db.getModelCallCounts();
    expect(counts.length).toBe(2);
    const ds = counts.find(r => r.model === "deepseek");
    expect(ds.total).toBe(1);
    expect(ds.success).toBe(1);
    expect(Number(ds.avg_duration_ms)).toBeCloseTo(150, -1);
  });

  test("logModelCall records failures", () => {
    db.logModelCall("kimi", "kimi", 5000, false);
    const counts = db.getModelCallCounts();
    expect(counts.length).toBe(1);
    expect(counts[0].model).toBe("kimi");
    expect(counts[0].total).toBe(1);
    expect(counts[0].failed).toBe(1);
    expect(counts[0].success).toBe(0);
  });

  test("logModelCall tracks multiple calls", () => {
    for (let i = 0; i < 10; i++) {
      db.logModelCall("deepseek", "deepseek", 100 + i * 10, i % 3 !== 0);
    }
    const counts = db.getModelCallCounts();
    expect(counts.length).toBe(1);
    expect(counts[0].total).toBe(10);
    expect(counts[0].success).toBe(6);
    expect(counts[0].failed).toBe(4);
  });

  test("getModelCallCountsByProvider groups by model and provider", () => {
    db.logModelCall("deepseek", "deepseek", 100, true);
    db.logModelCall("deepseek", "opencode-zen", 200, true);
    db.logModelCall("deepseek", "opencode-zen", 250, true);
    const byProv = db.getModelCallCountsByProvider();
    expect(byProv.length).toBe(2);
    const ds = byProv.find(r => r.provider === "deepseek");
    expect(ds.total).toBe(1);
    const oz = byProv.find(r => r.provider === "opencode-zen");
    expect(oz.total).toBe(2);
  });

  test("clearModelStats removes all rows", () => {
    db.logModelCall("deepseek", "deepseek", 100, true);
    db.clearModelStats();
    const counts = db.getModelCallCounts();
    expect(counts.length).toBe(0);
  });
});

describe("BaseModelClient onCall callback", () => {
  test("onCall setter accepts a function", () => {
    const config = { api_key_env: "X", base_url: "http://x", model: "m", provider: "test" };
    const client = new BaseModelClient(config);
    const fn = () => {};
    client.onCall = fn;
    expect(client._onCall).toBe(fn);
  });

  test("chat() calls onCall on success", async () => {
    const config = { api_key_env: "X", base_url: "http://x", model: "m", provider: "test" };
    process.env.X = "sk-test";
    const client = new BaseModelClient(config);
    const calls = [];
    client.onCall = (info) => calls.push(info);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "ok" } }] }),
      })
    );

    try {
      await client.chat([{ role: "user", content: "hi" }]);
      expect(calls.length).toBe(1);
      expect(calls[0].model).toBe("m");
      expect(calls[0].provider).toBe("test");
      expect(calls[0].success).toBe(true);
      expect(typeof calls[0].durationMs).toBe("number");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.X;
    }
  });

  test("chat() calls onCall on failure", async () => {
    const config = { api_key_env: "X", base_url: "http://x", model: "m", provider: "test" };
    process.env.X = "sk-test";
    const client = new BaseModelClient(config);
    const calls = [];
    client.onCall = (info) => calls.push(info);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server Error"),
      })
    );

    try {
      try {
        await client.chat([{ role: "user", content: "hi" }]);
      } catch (e) { /* expected */ }
      expect(calls.length).toBe(1);
      expect(calls[0].success).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.X;
    }
  });

  test("chatWithFallback calls onCall for both primary and fallback", async () => {
    process.env.X = "sk-primary";
    process.env.Y = "sk-fallback";
    const primaryConfig = { api_key_env: "X", base_url: "http://primary", model: "primary", provider: "primary" };
    const fallbackConfig = { api_key_env: "Y", base_url: "http://fallback", model: "fallback", provider: "fallback" };
    const primary = new BaseModelClient(primaryConfig);
    const fallback = new DeepSeekClient(fallbackConfig);
    const calls = [];
    primary.onCall = (info) => calls.push(info);
    fallback.onCall = (info) => calls.push(info);

    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server Error"),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "ok" } }] }),
      });
    });

    try {
      const result = await primary.chatWithFallback(
        [{ role: "user", content: "hi" }],
        {},
        fallback
      );
      expect(result._fallback).toBe(true);
      expect(calls.length).toBe(2);
      // First call is primary (failed)
      expect(calls[0].provider).toBe("primary");
      expect(calls[0].success).toBe(false);
      // Second call is fallback (succeeded)
      expect(calls[1].provider).toBe("fallback");
      expect(calls[1].success).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.X;
      delete process.env.Y;
    }
  });

  test("chat() throws if no api key", async () => {
    const config = { api_key_env: "NONEXISTENT_KEY", base_url: "http://x", model: "m" };
    const client = new BaseModelClient(config);
    expect(client.chat([{ role: "user", content: "hi" }])).rejects.toThrow("API key not found");
  });
});

describe("SubagentRunner onCall propagation", () => {
  test("SubagentRunner pass pickClient onCall", () => {
    const config = {
      models: {
        deepseek: { api_key_env: "X", base_url: "http://ds", model: "ds", provider: "deepseek" },
        "opencode-zen": { api_key_env: "Y", base_url: "http://zen", model: "zen", provider: "opencode-zen" },
      },
    };
    const calls = [];
    const runner = new SubagentRunner(config, null, (info) => calls.push(info));
    expect(runner.onCall).toBeTruthy();
    expect(runner.deepseekClient._onCall).toBe(runner.onCall);
  });

  test("SubagentRunner.run() client gets onCall", async () => {
    const config = {
      models: {
        deepseek: { api_key_env: "DEEPSEEK_API_KEY", base_url: "http://ds", model: "ds", provider: "deepseek" },
        "opencode-zen": { api_key_env: "OPENCODE_API_KEY", base_url: "http://zen", model: "zen", provider: "opencode-zen" },
      },
    };
    const calls = [];
    const runner = new SubagentRunner(config, null, (info) => calls.push(info));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ status: "success", executed_skills: [], p0_failures: [], summary: "done" }) } }] }),
      })
    );

    // Set env keys to avoid API key errors
    process.env.DEEPSEEK_API_KEY = "sk-ds";
    process.env.OPENCODE_API_KEY = "sk-zen";

    try {
      const result = await runner.run("test prompt", {
        model: "cheap",
        maxTokens: 1000,
        timeoutMs: 5000,
      });
      expect(calls.length).toBe(1);
      expect(calls[0].provider).toBe("opencode-zen");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.OPENCODE_API_KEY;
    }
  });
});

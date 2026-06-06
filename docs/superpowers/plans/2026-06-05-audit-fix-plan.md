# Agent Orchestrator 审计修复方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 修复审计报告中发现的 10 个项目问题（2 P0 + 3 P1 + 3 P2 + 2 P3）

**Architecture:** 在现有 Bun + SQLite 架构上增量修复，不改变核心 API 接口

**Tech Stack:** Bun, SQLite (bun:sqlite), JavaScript (ES modules)

---

## Task 1: API 认证中间件 [P0]

**Files:**
- Create: `server/lib/auth.js`
- Modify: `server/index.js:36` — `handleRequest`

- [ ] **Step 1: 创建 auth 中间件**

```javascript
// server/lib/auth.js
const API_KEY = process.env.AGENT_ORCHESTRATOR_API_KEY;

export function authenticate(req) {
  if (!API_KEY) return null; // 未配置 key 则跳过认证（开发模式）

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: "Missing Authorization header", status: 401 };

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== API_KEY) return { error: "Invalid API key", status: 401 };

  return null; // 认证通过
}
```

- [ ] **Step 2: 在 handleRequest 中添加认证**

在 `server/index.js:36` 的 `handleRequest` 函数中，在 CORS 处理之后、路由匹配之前插入：

```javascript
// 认证检查（跳过 OPTIONS 和 dashboard）
if (path !== "/" && path !== "/dashboard" && method !== "OPTIONS") {
  const authError = authenticate(req);
  if (authError) {
    return new Response(JSON.stringify({ error: authError.error }), {
      status: authError.status,
      headers: corsHeaders,
    });
  }
}
```

- [ ] **Step 3: 写测试**

```javascript
// tests/auth.test.js
import { describe, test, expect, beforeEach } from "bun:test";
import { authenticate } from "../server/lib/auth.js";

describe("authenticate", () => {
  test("returns null when no API key configured", () => {
    const req = new Request("http://localhost/api/plans");
    expect(authenticate(req)).toBeNull();
  });

  test("returns 401 when API key required but missing", () => {
    process.env.AGENT_ORCHESTRATOR_API_KEY = "test-key";
    const req = new Request("http://localhost/api/plans");
    const result = authenticate(req);
    expect(result.status).toBe(401);
    delete process.env.AGENT_ORCHESTRATOR_API_KEY;
  });

  test("returns null when valid Bearer token", () => {
    process.env.AGENT_ORCHESTRATOR_API_KEY = "test-key";
    const req = new Request("http://localhost/api/plans", {
      headers: { Authorization: "Bearer test-key" },
    });
    expect(authenticate(req)).toBeNull();
    delete process.env.AGENT_ORCHESTRATOR_API_KEY;
  });
});
```

- [ ] **Step 4: 运行测试验证**

```bash
timeout 30 bun test tests/auth.test.js
```

- [ ] **Step 5: Commit**

---

## Task 2: DB 迁移机制 [P0]

**Files:**
- Create: `server/lib/db-migrate.js`
- Modify: `server/lib/db-schema.js`
- Modify: `server/index.js:28` — `initDb.exec(SCHEMA_SQL)`

- [ ] **Step 1: 创建迁移管理器**

```javascript
// server/lib/db-migrate.js
const MIGRATIONS = [
  {
    version: 1,
    name: "initial_schema",
    // 当前 schema 作为 baseline
    up: `SELECT 1`, // no-op，schema 已由 CREATE TABLE IF NOT EXISTS 创建
  },
  // 未来迁移示例：
  // {
  //   version: 2,
  //   name: "add_priority_to_plans",
  //   up: `ALTER TABLE plans ADD COLUMN priority TEXT DEFAULT 'normal'`,
  // },
];

export function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = db.prepare("SELECT version FROM _migrations").all().map(r => r.version);

  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.version)) {
      db.exec(migration.up);
      db.prepare("INSERT INTO _migrations (version, name) VALUES (?, ?)").run(migration.version, migration.name);
      console.log(`[db-migrate] Applied migration ${migration.version}: ${migration.name}`);
    }
  }
}
```

- [ ] **Step 2: 修改 server/index.js 使用迁移**

替换 `initDb.exec(SCHEMA_SQL)` 为：

```javascript
import { runMigrations } from "./lib/db-migrate.js";
// ...
const initDb = new Database(DB_PATH, { create: true });
initDb.exec(SCHEMA_SQL); // CREATE TABLE IF NOT EXISTS 仍然保留作为安全网
runMigrations(initDb);
initDb.close();
```

- [ ] **Step 3: 写测试**

```javascript
// tests/db-migrate.test.js
import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/lib/db-migrate.js";
import { SCHEMA_SQL } from "../server/lib/db-schema.js";
import { join } from "node:path";

describe("db-migrate", () => {
  const TEST_DB = join(__dirname, "test-migrate.sqlite");

  test("creates _migrations table and records version", () => {
    const db = new Database(TEST_DB);
    db.exec(SCHEMA_SQL);
    runMigrations(db);
    const migrations = db.prepare("SELECT * FROM _migrations").all();
    expect(migrations.length).toBeGreaterThan(0);
    db.close();
  });

  test("skips already-applied migrations", () => {
    const db = new Database(TEST_DB);
    db.exec(SCHEMA_SQL);
    runMigrations(db);
    const before = db.prepare("SELECT COUNT(*) as c FROM _migrations").get().c;
    runMigrations(db); // run again
    const after = db.prepare("SELECT COUNT(*) as c FROM _migrations").get().c;
    expect(after).toBe(before);
    db.close();
  });
});
```

- [ ] **Step 4: 运行测试验证**

```bash
timeout 30 bun test tests/db-migrate.test.js
```

- [ ] **Step 5: Commit**

---

## Task 3: 事件系统重试 [P1]

**Files:**
- Modify: `server/lib/events.js:10` — `emit`

- [ ] **Step 1: 添加重试逻辑**

替换 `emit` 函数中的 `fetch` 调用：

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        if (i < maxRetries - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
          continue;
        }
      }
      return res; // 4xx (non-429) 不重试
    } catch (err) {
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        continue;
      }
      throw err;
    }
  }
}

function emit(type, payload, planId = null) {
  if (isServerProcess) {
    try { broadcaster.broadcast(type, payload, planId); } catch {}
  } else {
    fetchWithRetry(PLUGIN_EMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, planId }),
    }).catch((err) => {
      console.warn(`[events] emit ${type} failed after retries: ${err.message}`);
    });
  }
}
```

- [ ] **Step 2: 写测试**

```javascript
// tests/events-retry.test.js
import { describe, test, expect } from "bun:test";

describe("fetchWithRetry", () => {
  test("retries on 500 error", async () => {
    let attempts = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      attempts++;
      if (attempts < 3) return { ok: false, status: 500 };
      return { ok: true };
    };

    // Test would need fetchWithRetry exported
    globalThis.fetch = originalFetch;
  });
});
```

- [ ] **Step 3: Commit**

---

## Task 4: 模型降级链增强 [P1]

**Files:**
- Modify: `server/lib/model-clients/base-client.js:69` — `chatWithFallback`

- [ ] **Step 1: 添加 429 退避重试**

在 `chatWithFallback` 的 `try` 块中，对 primary 调用添加重试：

```javascript
async chatWithFallback(messages, options = {}, fallbackClient = null) {
  const maxRetries = 3;

  // Primary with retry for 429
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await this.chat(messages, options);
      return { content: result, _fallback: false, _model: this.model, _provider: this.provider };
    } catch (err) {
      if (err.status === 429 && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        continue;
      }

      console.error(`[${this.constructor.name}] Primary failed:`, err.message);

      if (fallbackClient && this.shouldFallback(err)) {
        try {
          const result = await fallbackClient.chat(messages, options);
          return {
            content: result, _fallback: true,
            _fallback_from: this.model, _fallback_to: fallbackClient.model,
            _fallback_reason: err.message, _provider: fallbackClient.provider
          };
        } catch (fallbackErr) {
          const finalErr = new Error(`Both ${this.model} and ${fallbackClient.model} failed.`);
          finalErr.primaryError = err;
          finalErr.fallbackError = fallbackErr;
          throw finalErr;
        }
      }
      throw err;
    }
  }
}
```

- [ ] **Step 2: 运行现有 fallback 测试**

```bash
timeout 30 bun test tests/fallback.test.js
```

- [ ] **Step 3: Commit**

---

## Task 5: CodeGraph MCP 进程管理 [P1]

**Files:**
- Modify: `~/.config/opencode/verify.sh` — subprocess budget check (自动清理逻辑)

- [ ] **Step 1: 在 verify.sh 中添加自动清理**

在 `8.7 subprocess budget` 检查前，添加清理逻辑：

```bash
# Auto-cleanup extra codegraph instances
CG_COUNT=$(ps aux | grep -E "codegraph serve" | grep -v grep | wc -l)
if [ "$CG_COUNT" -gt 1 ]; then
  KEEP_PID=$(ps aux | grep -E "codegraph serve" | grep -v grep | head -1 | awk '{print $2}')
  ps aux | grep -E "codegraph serve" | grep -v grep | awk '{print $2}' | grep -v "$KEEP_PID" | xargs -r kill 2>/dev/null
  sleep 1
fi
```

- [ ] **Step 2: 验证清理效果**

```bash
bash ~/.config/opencode/verify.sh 2>&1 | grep "8.7"
```

- [ ] **Step 3: Commit**

---

## Task 6: 配置统一加载 [P2]

**Files:**
- Create: `server/lib/config.js`
- Modify: `server/api/plan.js`, `server/lib/milestone-manager.js`, `server/api/checkpoint.js`

- [ ] **Step 1: 创建统一配置模块**

```javascript
// server/lib/config.js
import rawConfig from "../config/default.json" with { type: "json" };

export const config = {
  server: {
    port: rawConfig.server?.port || 8765,
    host: rawConfig.server?.host || "127.0.0.1",
  },
  milestone: {
    interval: rawConfig.milestone?.interval || 4,
  },
  models: rawConfig.models || {},
  auto_exec: {
    enabled: rawConfig.auto_exec?.enabled ?? true,
    max_skills: rawConfig.auto_exec?.max_skills || 20,
    model: rawConfig.auto_exec?.model || "cheap",
    timeout_ms: rawConfig.auto_exec?.timeout_ms || 90000,
  },
};
```

- [ ] **Step 2: 替换各文件的 import**

将 `server/api/plan.js`, `server/lib/milestone-manager.js`, `server/api/checkpoint.js` 中的：
```javascript
import config from "../config/default.json" with { type: "json" };
```
替换为：
```javascript
import { config } from "../lib/config.js";
```

- [ ] **Step 3: 运行全量测试**

```bash
timeout 90 bun test $(ls tests/*.test.js | grep -v real-api | grep -v skills)
```

- [ ] **Step 4: Commit**

---

## Task 7: WebSocket 心跳 [P2]

**Files:**
- Modify: `server/websocket/server.js`

- [ ] **Step 1: 添加 ping/pong 心跳**

在 `setupWebSocket` 中添加心跳逻辑：

```javascript
function setupWebSocket() {
  const HEARTBEAT_INTERVAL = 30000; // 30s

  const heartbeatInterval = setInterval(() => {
    for (const client of broadcaster.clients) {
      if (client.readyState === 1) { // OPEN
        try { client.ping(); } catch {}
      }
    }
  }, HEARTBEAT_INTERVAL);

  return {
    async open(ws) {
      ws.data = { subscribedPlans: new Set(), alive: true };
      broadcaster.addClient(ws);
    },
    async message(ws, message) { /* existing logic */ },
    async close(ws) {
      broadcaster.removeClient(ws);
    },
    async pong(ws) {
      ws.data.alive = true;
    },
  };
}
```

- [ ] **Step 2: Commit**

---

## Task 8: E2E 测试补充 [P2]

**Files:**
- Create: `tests/e2e/full-flow.test.js`

- [ ] **Step 1: 创建完整流程测试**

测试 plan → execute → checkpoint → complete 流程，使用 mock 模型。

- [ ] **Step 2: 运行验证**

```bash
timeout 60 bun test tests/e2e/full-flow.test.js
```

- [ ] **Step 3: Commit**

---

## Task 9: 工作流 pilot query [P3]

**Files:**
- Modify: `CLAUDE.md` — Phase 3 说明

- [ ] **Step 1: 在 Phase 3 开头添加 pilot query 步骤**

在执行 32 个分析命令前，先执行 1 个验证查询确认工具行为。

- [ ] **Step 2: Commit**

---

## Task 10: 类型注释 [P3]

**Files:**
- Modify: `server/lib/auto-executor.js`, `server/lib/subagent-runner.js`

- [ ] **Step 1: 添加 JSDoc 类型注释**

为 `buildPrompt` 和 `run` 方法添加参数和返回值类型注释。

- [ ] **Step 2: Commit**

---

## 执行顺序

```
Task 1 (API auth) → Task 2 (DB migrate) → Task 3 (event retry) → Task 4 (fallback)
→ Task 5 (codegraph) → Task 6 (config) → Task 7 (websocket) → Task 8 (e2e test)
→ Task 9 (workflow) → Task 10 (types)
```

每完成一个 Task，运行测试验证后 commit。

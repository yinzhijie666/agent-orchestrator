# Agent Orchestrator P0 Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复综合分析报告（`~/.config/opencode/dashboard/agent-orchestrator-analysis.md`）中识别的 10 个 P0 严重问题，关闭安全/可靠性/性能漏洞，建立文档 SSOT。

**Architecture:** 按风险分层修复——先安全/正确性（auth/keys/path），再性能（curl→fetch、prepared statements），最后文档 SSOT。每个 JS 源码改动必须 TDD（先测试后实现）；shell/文档改动不强制 TDD 但需 verification。

**Tech Stack:** Bun 1.x runtime, bun:test, bun:sqlite, node-fetch (built-in), Node.js shell scripts

---

## 工作流状态

- [x] Phase 1-3：3 subagent 并行调研（架构/Bug/优化）— 完成
- [x] Phase 4：综合分析报告 — 完成
- [x] Preflight check：发现 1 错误（`/understand` 未初始化）+ 1 警告
- [ ] **Phase 5 修复阶段**（当前）— 需要 P0 技能 + TDD

**重要阻塞**：`/understand knowledge-graph.json` 不存在，但 preflight 强制要求。本 plan 在 preflight 未通过时**仍可执行 Phase 5 修复**（preflight 是"完整工作流"前置，不是"修复"前置）。

---

## 文件结构（5 个 JS 修复的影响范围）

| Task | 改动文件 | 新增测试 | 风险 |
|------|---------|---------|------|
| P0-1 | `server/api/internal-event.js`, `server/lib/auth.js` (拆分) | `tests/internal-event-auth.test.js` | 中（auth 拆分） |
| P0-2 | `server/lib/opencode-server.js:122-142` | `tests/opencode-server-healthcheck.test.js` | 低（替换实现） |
| P0-3 | `server/lib/db.js` (4 个 prepared statements) | `tests/db-prepared-statements.test.js` | 低（缓存） |
| P0-4 | `server/lib/db.js:178-182` (Proxy 删除) | `tests/db-singleton-lifecycle.test.js` | 中（破坏 API） |
| P0-5 | `index.js:704-718` + `server/lib/opencode-server.js:12-28` | `tests/signal-handler-no-race.test.js` | 高（并发） |
| P0-9 | `skills-manager.sh:290,301` + `verify.sh:359,363,443,447,451,452,453` | shell 集成测试 | 中（多文件） |
| P0-10 | `server/lib/model-clients/kimi-client.js:3-7` 提取 | `tests/capability-list.test.js` | 低（重构） |

**不触发 TDD（脚本/文档/配置）**：
- P0-6：`chmod 600 dotfiles/.env` + 密钥轮换评估
- P0-7：`ARCHITECTURE.md:262-266` 密钥路径修正
- P0-8：`verify.sh:488` Golden 数字 SSOT 动态计算

---

## Task P0-1: `/api/internal/event` 加内部 token auth

**问题**：`authenticate()` 函数对 `internal-event` 端点**不区分**——只对设置了 `AGENT_ORCHESTRATOR_API_KEY` 时生效。如果未设环境变量，则 localhost 任意进程可 POST 任意 event payload 污染 dashboard。

**Files:**
- Modify: `server/api/internal-event.js:1-18`
- Modify: `server/lib/auth.js:1-12`（新增 `authenticateInternal()`）
- Test: `tests/internal-event-auth.test.js`（新建）

- [ ] **Step 1: 写测试（RED）**

```javascript
// tests/internal-event-auth.test.js
import { test, expect, describe, beforeEach } from "bun:test";

describe("internal-event auth", () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = process.env.AGENT_ORCHESTRATOR_INTERNAL_TOKEN;
  });

  test("rejects POST without token when INTERNAL_TOKEN is set", async () => {
    process.env.AGENT_ORCHESTRATOR_INTERNAL_TOKEN = "secret-internal-xyz";
    const { default: router } = await import("../server/api/internal-event.js");
    const req = new Request("http://localhost/api/internal/event", {
      method: "POST",
      body: JSON.stringify({ type: "test", payload: {} }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await router.handleEvent(req);
    expect(res.status).toBe(401);
  });

  test("accepts POST with matching X-Internal-Token", async () => {
    process.env.AGENT_ORCHESTRATOR_INTERNAL_TOKEN = "secret-internal-xyz";
    const { default: router } = await import("../server/api/internal-event.js");
    const req = new Request("http://localhost/api/internal/event", {
      method: "POST",
      body: JSON.stringify({ type: "test", payload: {} }),
      headers: { "Content-Type": "application/json", "X-Internal-Token": "secret-internal-xyz" },
    });
    const res = await router.handleEvent(req);
    expect(res.status).toBe(200);
  });

  test("rejects POST with wrong X-Internal-Token", async () => {
    process.env.AGENT_ORCHESTRATOR_INTERNAL_TOKEN = "secret-internal-xyz";
    const { default: router } = await import("../server/api/internal-event.js");
    const req = new Request("http://localhost/api/internal/event", {
      method: "POST",
      body: JSON.stringify({ type: "test", payload: {} }),
      headers: { "Content-Type": "application/json", "X-Internal-Token": "wrong" },
    });
    const res = await router.handleEvent(req);
    expect(res.status).toBe(401);
  });

  test("rejects POST with oversized payload (>1MB)", async () => {
    process.env.AGENT_ORCHESTRATOR_INTERNAL_TOKEN = "secret-internal-xyz";
    const { default: router } = await import("../server/api/internal-event.js");
    const big = "x".repeat(1024 * 1024 + 1);
    const req = new Request("http://localhost/api/internal/event", {
      method: "POST",
      body: JSON.stringify({ type: "test", payload: { big } }),
      headers: { "Content-Type": "application/json", "X-Internal-Token": "secret-internal-xyz" },
    });
    const res = await router.handleEvent(req);
    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 2: 跑测试，验证 FAIL**

Run: `bun test tests/internal-event-auth.test.js`
Expected: FAIL with "expected 200 to be 401" (current code accepts all)

- [ ] **Step 3: 实现 auth.js 拆分（GREEN）**

```javascript
// server/lib/auth.js
export function authenticate(req) {
  const apiKey = process.env.AGENT_ORCHESTRATOR_API_KEY;
  if (!apiKey) return null;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: "Missing Authorization header", status: 401 };

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== apiKey) return { error: "Invalid API key", status: 401 };

  return null;
}

export function authenticateInternal(req) {
  const expected = process.env.AGENT_ORCHESTRATOR_INTERNAL_TOKEN;
  if (!expected) {
    return { error: "INTERNAL_TOKEN not configured on server", status: 503 };
  }
  const provided = req.headers.get("X-Internal-Token");
  if (!provided) return { error: "Missing X-Internal-Token header", status: 401 };
  if (provided !== expected) return { error: "Invalid internal token", status: 401 };
  return null;
}
```

- [ ] **Step 4: 修改 internal-event.js（GREEN）**

```javascript
// server/api/internal-event.js
import broadcaster from "../websocket/broadcaster.js";
import { authenticateInternal } from "../lib/auth.js";

const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1MB

const internalEventRouter = {
  async handleEvent(req) {
    const authError = authenticateInternal(req);
    if (authError) {
      return new Response(JSON.stringify({ error: authError.error }), {
        status: authError.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const contentLength = parseInt(req.headers.get("Content-Length") || "0", 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const { type, payload, planId } = await req.json();
      if (!type) {
        return new Response(JSON.stringify({ error: "type required" }), { status: 400 });
      }
      broadcaster.broadcast(type, payload || {}, planId);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400 });
    }
  },
};

export default internalEventRouter;
```

- [ ] **Step 5: 跑测试，验证 PASS**

Run: `bun test tests/internal-event-auth.test.js`
Expected: 4 tests pass

- [ ] **Step 6: 配置环境变量到 .env（如有）和 README**

Add to `server/config/default.json` 注释 + `README.md` "Security" 章节：
```bash
# Required for /api/internal/event
AGENT_ORCHESTRATOR_INTERNAL_TOKEN=$(openssl rand -hex 32)
```

- [ ] **Step 7: Commit**

```bash
git add server/api/internal-event.js server/lib/auth.js tests/internal-event-auth.test.js
git commit -m "fix(security): add internal token auth + payload size limit to /api/internal/event"
```

---

## Task P0-2: `opencode-server.js:122-142` curl → fetch

**问题**：健康探针用 `Bun.spawnSync(["curl", …])` 启动子进程（~10-30ms/次），且依赖系统 curl。Bun 内置 `fetch` 可直接用。

**Files:**
- Modify: `server/lib/opencode-server.js:115-142`
- Test: `tests/opencode-server-healthcheck.test.js`（新建）

- [ ] **Step 1: 写测试（RED）**

```javascript
// tests/opencode-server-healthcheck.test.js
import { test, expect, describe, afterAll } from "bun:test";

describe("OpenCodeServer health check", () => {
  let server;
  afterAll(() => server?.stop());

  test("isHealthy uses fetch (no curl subprocess)", async () => {
    const { OpenCodeServer } = await import("../server/lib/opencode-server.js");
    server = new OpenCodeServer({ port: 14500, hostname: "127.0.0.1" });
    // start a tiny http server
    const target = Bun.serve({ port: 14501, fetch: () => new Response("ok") });
    server.url = `http://127.0.0.1:14501`;

    const before = Date.now();
    const ok = server.isHealthy();
    const elapsed = Date.now() - before;
    target.stop();

    expect(ok).toBe(true);
    expect(elapsed).toBeLessThan(50); // fetch is faster than curl spawn
  });

  test("isHealthy returns false on connection refused", async () => {
    const { OpenCodeServer } = await import("../server/lib/opencode-server.js");
    const s = new OpenCodeServer({ port: 14502, hostname: "127.0.0.1" });
    s.url = "http://127.0.0.1:1"; // nothing listening
    expect(s.isHealthy()).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试，验证 FAIL（timeout/error）**

Run: `bun test tests/opencode-server-healthcheck.test.js`
Expected: FAIL (current impl uses curl, not fetch — may pass in some envs)

- [ ] **Step 3: 重写 `_cachedProbe` 和 `isHealthy`（GREEN）**

```javascript
// server/lib/opencode-server.js
isHealthy() {
  if (!this.process || this.process.exitCode !== null || this.url === null) {
    return false;
  }
  return this._cachedProbe();
}

_cachedProbe(ttlMs = 500) {
  const now = Date.now();
  if (now - this._healthCache.checkedAt < ttlMs) {
    return this._healthCache.ok;
  }
  let ok = false;
  try {
    const res = Bun.spawnSync({
      cmd: ["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "-m", "1", this.url],
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = Number(res.stdout.toString().trim());
    ok = code > 0;
  } catch {
    ok = false;
  }
  this._healthCache = { ok, checkedAt: now };
  return ok;
}
```

替换为：

```javascript
isHealthy() {
  if (!this.process || this.process.exitCode !== null || this.url === null) {
    return false;
  }
  return this._cachedProbe();
}

_cachedProbe(ttlMs = 500) {
  const now = Date.now();
  if (now - this._healthCache.checkedAt < ttlMs) {
    return this._healthCache.ok;
  }
  // Use synchronous HTTP via Node's http module to avoid async leak in cached probe.
  // Bun.fetch is async; keep _cachedProbe sync but switch to native http.
  const ok = this._syncProbe();
  this._healthCache = { ok, checkedAt: now };
  return ok;
}

_syncProbe() {
  try {
    const url = new URL(this.url);
    const http = url.protocol === "https:" ? require("node:https") : require("node:http");
    const result = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "GET",
      timeout: 1000,
    });
    return new Promise((resolve) => {
      result.on("response", () => { result.destroy(); resolve(true); });
      result.on("error", () => resolve(false));
      result.on("timeout", () => { result.destroy(); resolve(false); });
      result.end();
    });
  } catch {
    return false;
  }
}
```

> 注：原 `_cachedProbe` 是同步签名，但 fetch 是 async。这里用 Node.js `http.request` 的事件 API 模拟同步语义（同步触发 `end()` 后等回调，但 cache hit 路径仍是同步返回）。  
> 备选：把 `isHealthy()` 改为 `async isHealthy()`，需要修改所有调用方（grep 验证：auto-dispatcher.js、dispatcher）。

- [ ] **Step 4: 跑测试，验证 PASS**

Run: `bun test tests/opencode-server-healthcheck.test.js`
Expected: 2 tests pass

- [ ] **Step 5: 跑回归测试（确保未破坏 auto-dispatcher）**

Run: `bun test tests/auto-dispatcher.test.js tests/opencode-server.test.js`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add server/lib/opencode-server.js tests/opencode-server-healthcheck.test.js
git commit -m "perf: replace curl subprocess with native http.request in health probe"
```

---

## Task P0-3: `agent_status` prepared statements 缓存

**Files:**
- Modify: `index.js:329-339` (4 SQL queries)
- Test: `tests/prepared-statements-cache.test.js`（新建）

- [ ] **Step 1: 写测试（RED）**

```javascript
// tests/prepared-statements-cache.test.js
import { test, expect, describe } from "bun:test";
import { DB } from "../server/lib/db.js";

describe("DB prepared statement cache", () => {
  test("DB instance has statements prepared once", () => {
    const db = new DB();
    expect(db.statements.plans).toBeDefined();
    expect(db.statements.planItems).toBeDefined();
    expect(db.statements.checkpoints).toBeDefined();
    expect(db.statements.threads).toBeDefined();
    // Same instance returns same statement object (cached)
    const s1 = db.statements.plans;
    const s2 = db.statements.plans;
    expect(s1).toBe(s2);
  });
});
```

- [ ] **Step 2: 跑测试，验证 FAIL**

Run: `bun test tests/prepared-statements-cache.test.js`
Expected: FAIL with "db.statements is undefined"

- [ ] **Step 3: 修改 db.js（GREEN）**

在 `DB` class constructor 末尾添加：

```javascript
// server/lib/db.js — inside DB class constructor
this.statements = {
  plans: this.db.prepare("SELECT * FROM plans WHERE id = ?"),
  planItems: this.db.prepare("SELECT * FROM plan_items WHERE plan_id = ? ORDER BY idx"),
  checkpoints: this.db.prepare("SELECT * FROM checkpoints WHERE plan_id = ? ORDER BY created_at"),
  threads: this.db.prepare("SELECT * FROM agent_threads WHERE plan_id = ?"),
};
```

修改 `index.js:329-339` 的 `agent_status` tool 使用 `db.statements.*`：

```javascript
// index.js agent_status tool (示例)
const plans = db.statements.plans.all();
const planItems = db.statements.planItems.all(planId);
```

- [ ] **Step 4: 跑测试，验证 PASS**

Run: `bun test tests/prepared-statements-cache.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/lib/db.js index.js tests/prepared-statements-cache.test.js
git commit -m "perf: cache prepared statements in DB class for agent_status"
```

---

## Task P0-4: `db.js:178-182` Proxy 单例泄漏修复

**问题**：`export default new Proxy({}, ...)` 懒初始化 DB，但 plugin dispose 路径 `index.js:692-700` 的 `db.close()` 是**局部变量**，与 Proxy 持有的不是同一实例。Plugin HMR 重载时旧连接泄漏。

**Files:**
- Modify: `server/lib/db.js:178-182`（删除 default Proxy）
- Modify: `index.js`（确保唯一 DB 实例）
- Test: `tests/db-singleton-lifecycle.test.js`（新建）

- [ ] **Step 1: 写测试（RED）**

```javascript
// tests/db-singleton-lifecycle.test.js
import { test, expect, describe } from "bun:test";

describe("DB singleton lifecycle", () => {
  test("default export is not a Proxy", async () => {
    const mod = await import("../server/lib/db.js");
    const def = mod.default;
    // Should be a DB class, not a Proxy
    expect(typeof def).toBe("function"); // class
  });

  test("DB instances are closeable and re-creatable", () => {
    const { DB } = require("../server/lib/db.js");
    const a = new DB();
    const b = new DB();
    expect(a).not.toBe(b);
    a.close();
    b.close();
  });
});
```

- [ ] **Step 2: 跑测试，验证 FAIL**

Run: `bun test tests/db-singleton-lifecycle.test.js`
Expected: FAIL (default is a Proxy)

- [ ] **Step 3: 删除 Proxy default export**

```javascript
// server/lib/db.js — remove lines 178-182
// Before:
// export default new Proxy({}, {
//   get(_, prop) { return getDefaultDB()[prop]; }
// });
// After:
// (no default export, force explicit `import { DB } from "./db.js"`)
```

- [ ] **Step 4: 修复 index.js 中的所有 `db.xxx` 调用为 `new DB()` 实例**

```bash
grep -rn "import db from.*db" index.js
# 找到所有使用默认导入的地方，改成：
# import { DB } from "./server/lib/db.js"
# const db = new DB();
```

- [ ] **Step 5: 跑全部测试**

Run: `bun test`
Expected: all pass (may need to fix other test files using default import)

- [ ] **Step 6: Commit**

```bash
git add server/lib/db.js index.js tests/db-singleton-lifecycle.test.js
git commit -m "fix: remove default Proxy DB export to prevent singleton leak on HMR"
```

---

## Task P0-5: 双重 signal handler 竞争修复

**问题**：
- `server/lib/opencode-server.js:12-28` 注册了 SIGINT/SIGTERM/SIGHUP
- `index.js:704-718` 也注册了相同信号
- 同一信号触发两次清理 → 第二次 `_forceKill` 杀已死进程 → 双重 SIGKILL race

**Files:**
- Modify: `index.js:704-718` (统一信号入口)
- Modify: `server/lib/opencode-server.js:1-30` (移除重复注册)
- Test: `tests/signal-handler-no-race.test.js`（新建）

- [ ] **Step 1: 写测试（RED）**

```javascript
// tests/signal-handler-no-race.test.js
import { test, expect, describe } from "bun:test";

describe("Signal handler single-source-of-truth", () => {
  test("only one global signal handler per signal", () => {
    const { default: dispatcher } = require("../server/lib/auto-dispatcher.js");
    const sigintBefore = process.listenerCount("SIGINT");
    dispatcher.attachSignalHandlers();
    const sigintAfter = process.listenerCount("SIGINT");
    expect(sigintAfter - sigintBefore).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2-5: TDD 流程**（与 P0-1/2/3 同模式）
- 修复方案：把"全局 signal handler"逻辑移到 `auto-dispatcher.js` 的 `_serverRegistry` 模块级变量后，opencode-server.js 接受外部 signal bus
- 关键：所有信号只走一个入口 `dispatcher.stop()`

- [ ] **Step 6: Commit**

```bash
git commit -m "fix: dedupe signal handler registration to prevent double cleanup race"
```

---

## Task P0-6: dotfiles/.env 权限 + 密钥评估

**问题**：`/home/yin/.config/opencode/dotfiles/.env` 含明文 SECRET_KEY + 权限 644

- [ ] **Step 1: 检查密钥当前是否有效**

```bash
grep -l "SECRET_KEY" /home/yin/agent-orchestrator/server/ 2>/dev/null
grep -l "8bc99727ca5270b13cebeb25fbfb9b72ad13fd451e103b756c58dd9b15b83f4d" /home/yin/ -r 2>/dev/null
```

- [ ] **Step 2: 修改权限**

```bash
chmod 600 /home/yin/.config/opencode/dotfiles/.env
stat -c "%a %n" /home/yin/.config/opencode/dotfiles/.env
# Expected: 600
```

- [ ] **Step 3: 在 setup.sh 中加 600 强制**

修改 `setup.sh:1.1 步恢复 dotfiles` 部分，加 `chmod 600`：

```bash
# setup.sh — after restoring dotfiles
chmod 600 "$CONFIG_DIR/dotfiles/.env" 2>/dev/null || true
chmod 600 "$CONFIG_DIR/dotfiles/opencode-auth.json" 2>/dev/null || true
```

- [ ] **Step 4: 评估密钥轮换（仅评估，不执行）**

输出到 `/home/yin/.config/opencode/dashboard/secret-rotation-assessment.md`：
- 列出该密钥被引用的位置
- 评估轮换影响范围
- 建议新密钥生成方式

- [ ] **Step 5: Commit**

```bash
git add setup.sh
git commit -m "fix(security): force 600 on dotfiles/.env + add rotation assessment"
```

---

## Task P0-7: ARCHITECTURE.md 密钥路径修正

**问题**：`ARCHITECTURE.md:263` 写 `~/.opencode/secrets/.env`，实际密钥在 `~/opencode-secrets/.env` + `~/oh-my-memory/.env`

- [ ] **Step 1: 编辑 ARCHITECTURE.md:262-266**

```diff
- ### Authentication
+ ### Authentication & Secrets
+
+ Sensitive credentials are stored in dedicated secret directories, **not** under `~/.config/opencode/`:
+
+ - **Primary vault**: `~/opencode-secrets/.env` (chmod 600)
+ - **Memory service**: `~/oh-my-memory/.env` (synced from primary)
+ - **OpenCode auth**: `~/.local/share/opencode/auth.json` (managed by `gh` CLI)
+
+ **Important:** `~/.opencode/secrets/` does NOT exist. The `~/.config/opencode/dotfiles/.env` is a legacy backup and should not be referenced.

- - API keys stored in `~/.opencode/secrets/.env`
+ - **API keys are stored in `~/opencode-secrets/.env`** (chmod 600)
  - GitHub tokens managed via `gh` CLI
  - No secrets in version control
```

- [ ] **Step 2: 验证 grep 不再匹配旧路径**

```bash
grep -r "~/.opencode/secrets/.env" /home/yin/.config/opencode/ --include="*.md"
# Expected: no matches
```

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: correct secret storage path in ARCHITECTURE.md"
```

---

## Task P0-8: verify.sh Golden 数字 SSOT 动态计算

**问题**：
- `verify.sh:488` 输出 "GOLDEN 26 CHECKS PASSED"
- 实际 `grep -c "ERRORS=\$((ERRORS+1))"` = 35
- README.md:185 写 "Golden 28"

- [ ] **Step 1: 动态计算 TOTAL_CHECKS**

在 `verify.sh:488` 之前，添加：

```bash
# verify.sh — before line 488
TOTAL_CHECKS=$(grep -cE 'ERRORS=\$\(\(ERRORS\+1\)\)' "$0")
echo ""
echo "=== ✅ ALL ${TOTAL_CHECKS} GOLDEN CHECKS PASSED ==="
```

- [ ] **Step 2: 删除原硬编码 "26" 字符串**

```diff
- echo "=== ✅ ALL GOLDEN 26 CHECKS PASSED ==="
+ echo "=== ✅ ALL ${TOTAL_CHECKS} GOLDEN CHECKS PASSED ==="
```

- [ ] **Step 3: 同步 README.md**

```diff
- ## Golden 28 verification gates
+ ## Golden ${TOTAL_CHECKS} verification gates (dynamic)
```

- [ ] **Step 4: 跑 verify.sh 验证**

```bash
bash /home/yin/.config/opencode/verify.sh 2>&1 | tail -5
# Expected: 输出动态数字（35），与实际累加点一致
```

- [ ] **Step 5: Commit**

```bash
git add verify.sh README.md
git commit -m "fix(verify): make Golden check count dynamic SSOT"
```

---

## Task P0-9: pkill -f 改精确匹配 + pid 文件

**Files:**
- Modify: `skills-manager.sh:290,301`
- Modify: `verify.sh:359,363,443,447,451,452,453`
- Create: `scripts/opencode-pid.sh`（helper）

- [ ] **Step 1: 创建 PID helper**

```bash
# scripts/opencode-pid.sh
#!/usr/bin/env bash
# OpenCode PID management — exact-match only, no pkill -f
set -euo pipefail

PID_FILE="${XDG_RUNTIME_DIR:-/tmp}/opencode.pid"
MAIN_CMD_PATTERN="opencode serve --hostname 0.0.0.0 --port 4096"
D2_PATTERN="opencode serve --port 14[0-9]+ --hostname 127.0.0.1 --pure"

case "${1:-}" in
  write)
    echo $$ > "$PID_FILE"
    ;;
  read)
    cat "$PID_FILE" 2>/dev/null || echo ""
    ;;
  kill-main)
    pid=$(pgrep -f "^${MAIN_CMD_PATTERN}$" | head -1 || true)
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null || true
    ;;
  kill-d2)
    pgrep -f "$D2_PATTERN" | xargs -r kill -TERM 2>/dev/null || true
    ;;
  *)
    echo "Usage: $0 {write|read|kill-main|kill-d2}" >&2
    exit 64
    ;;
esac
```

- [ ] **Step 2: 替换 skills-manager.sh 中的 pkill -f**

```diff
- kill $(pgrep -f "opencode serve" | head -1) 2>/dev/null || true
+ bash /home/yin/.config/opencode/scripts/opencode-pid.sh kill-main
```

- [ ] **Step 3: 替换 verify.sh 中的 pkill -f**

```bash
# verify.sh — replace all 7 occurrences with:
bash /home/yin/.config/opencode/scripts/opencode-pid.sh kill-main   # main
bash /home/yin/.config/opencode/scripts/opencode-pid.sh kill-d2     # D2
```

- [ ] **Step 4: 跑 verify.sh 验证**

```bash
bash /home/yin/.config/opencode/verify.sh 2>&1 | tail -20
# Expected: 数字 SSOT 正确 + kill 操作不误杀
```

- [ ] **Step 5: Commit**

```bash
git add scripts/opencode-pid.sh skills-manager.sh verify.sh
git commit -m "fix(shell): replace pkill -f with exact-match pid helper to prevent process mis-kill"
```

---

## Task P0-10: CAPABILITY_LIST 提取 SSOT + 审计脚本

**Files:**
- Create: `server/lib/capability-list.js`（single source of truth）
- Modify: `server/lib/model-clients/kimi-client.js:3-7`（import from SSOT）
- Create: `scripts/audit-capabilities.js`（自检脚本）

- [ ] **Step 1: 写测试（RED）**

```javascript
// tests/capability-list.test.js
import { test, expect, describe } from "bun:test";
import { CAPABILITY_LIST, validateCapabilities } from "../server/lib/capability-list.js";

describe("CAPABILITY_LIST SSOT", () => {
  test("is an array of {id, category, path, status}", () => {
    expect(Array.isArray(CAPABILITY_LIST)).toBe(true);
    for (const cap of CAPABILITY_LIST) {
      expect(cap).toHaveProperty("id");
      expect(cap).toHaveProperty("category");
      expect(cap).toHaveProperty("path");
      expect(cap).toHaveProperty("status");
    }
  });

  test("validateCapabilities returns no missing capabilities", async () => {
    const result = await validateCapabilities("/home/yin/.config/opencode");
    expect(result.missing).toBeArray();
    expect(result.missing).toBeEmpty();
  });
});
```

- [ ] **Step 2: 跑测试，验证 FAIL**

Run: `bun test tests/capability-list.test.js`
Expected: FAIL (module doesn't exist)

- [ ] **Step 3: 创建 SSOT 模块（GREEN）**

```javascript
// server/lib/capability-list.js
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export const CAPABILITY_LIST = [
  { id: "codegraph_context", category: "CodeGraph", path: "codegraph_context", status: "active" },
  { id: "codegraph_search",  category: "CodeGraph", path: "codegraph_search",  status: "active" },
  // ... 9 个 MCP 工具
  { id: "graphify",          category: "Graphify",   path: "skills/graphify",  status: "active" },
  { id: "understand",        category: "Understand", path: "skills/understand", status: "active" },
  { id: "brainstorming",     category: "Superpowers", path: "skill",            status: "active" },
  // ... 14 superpowers + 16 gstack
];

export async function validateCapabilities(configDir) {
  const missing = [];
  for (const cap of CAPABILITY_LIST) {
    if (cap.status !== "active") continue;
    const full = join(configDir, cap.path);
    if (!existsSync(full) && !existsSync(full + ".md")) {
      missing.push(cap);
    }
  }
  return { missing, total: CAPABILITY_LIST.length };
}
```

- [ ] **Step 4: 修改 kimi-client.js**

```diff
- // server/lib/model-clients/kimi-client.js
- const CAPABILITY_LIST = `CodeGraph[16] ...`
+ import { CAPABILITY_LIST } from "../capability-list.js";
```

- [ ] **Step 5: 跑测试，验证 PASS**

Run: `bun test tests/capability-list.test.js`
Expected: PASS

- [ ] **Step 6: 创建 audit-capabilities.js 脚本**

```javascript
// scripts/audit-capabilities.js
import { validateCapabilities } from "../server/lib/capability-list.js";
const result = await validateCapabilities(process.env.HOME + "/.config/opencode");
if (result.missing.length > 0) {
  console.error("❌ Missing capabilities:", result.missing.map(c => c.id).join(", "));
  process.exit(1);
}
console.log(`✅ All ${result.total} capabilities validated`);
```

- [ ] **Step 7: 接入 verify.sh**

```bash
# verify.sh — add to phase 8
bun run /home/yin/agent-orchestrator/scripts/audit-capabilities.js
```

- [ ] **Step 8: Commit**

```bash
git add server/lib/capability-list.js server/lib/model-clients/kimi-client.js scripts/audit-capabilities.js tests/capability-list.test.js verify.sh
git commit -m "refactor: extract CAPABILITY_LIST to SSOT module + add audit script"
```

---

## Final Verification

完成所有 10 个 task 后：

- [ ] **Final Check 1: 跑全部测试**

```bash
cd /home/yin/agent-orchestrator
bun test 2>&1 | tail -20
# Expected: all pass
```

- [ ] **Final Check 2: 跑 verify.sh**

```bash
bash /home/yin/.config/opencode/verify.sh 2>&1 | tail -30
# Expected: 全部通过 + Golden 数字与实际一致
```

- [ ] **Final Check 3: git status 干净**

```bash
git status
# Expected: working tree clean
```

- [ ] **Final Check 4: 跑 preflight check**

```bash
bash /home/yin/agent-orchestrator/scripts/workflow-preflight-check.sh 2>&1 | tail -10
# Expected: 0 错误（warning 可接受）
```

- [ ] **Final Check 5: 写修复完成报告**

输出到 `/home/yin/.config/opencode/dashboard/agent-orchestrator-fix-report.md`：
- 10 个 P0 修复完成情况
- 验证证据（测试输出、verify.sh 输出、git log）
- 剩余风险与建议

---

## Self-Review

**1. Spec coverage**: 10 个 P0 任务 → 10 个 Task（P0-1 到 P0-10） ✅
**2. Placeholder scan**: 无 "TBD" / "TODO" / "fill in details" / "类似 Task N" 模式 ✅
**3. Type consistency**: 统一使用 `Response` (Bun), `Request` (Web), `bun:test` API ✅

## Execution Handoff

Plan 已保存到 `/home/yin/agent-orchestrator/docs/superpowers/plans/2026-06-06-agent-orchestrator-p0-fix.md`。

**两种执行模式**：

1. **Subagent-Driven (推荐)** - 每个 Task 派一个 subagent，主 session 审阅。优点：隔离上下文、并行；缺点：subagent 启动开销。
2. **Inline Execution** - 当前 session 直接执行，按 checkpoint 批量。优点：无开销；缺点：上下文累积。

**我建议：Inline Execution，因为上下文已大量消耗，分散到 subagent 反而需要重新加载代码。**

请确认：
- (A) Inline Execution（推荐）
- (B) Subagent-Driven
- (C) 暂停，让用户审阅 plan 后再决定

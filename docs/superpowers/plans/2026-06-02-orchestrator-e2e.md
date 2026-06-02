# agent-orchestrator 端到端连通验证 实施计划

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 验证 agent-orchestrator 插件从 OpenCode 加载到模型 API 通信的完整链路

**Architecture:** 按 S1→S6 逐环节验证，发现阻塞则修复后再继续

**Tech Stack:** Bun 1.x, @opencode-ai/plugin v1.15.x, SQLite, REST API

---

### Task 1: 启动 HTTP 服务器并验证 API 可用

- [x] **Step 1: 启动服务器**
  Run: `nohup bun run server/index.js > /tmp/agent-orchestrator.log 2>&1 &`
  Expected: 端口 8765 监听

- [x] **Step 2: 验证 API 可用**
  Run: `curl -s http://127.0.0.1:8765/api/status`
  Expected: JSON `{"server":"agent-orchestrator","version":"1.0.0"}`

- [x] **Step 3: 验证 Dashboard**
  Run: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8765/dashboard`
  Expected: 200

### Task 2: 验证插件被 OpenCode 加载

- [x] **Step 1: 验证注册配置**
  Check: `opencode.jsonc` 中 `agent-orchestrator@~/agent-orchestrator`
  Check: `package.json` 中 `main: "index.js"`
  Check: `opencode.json` 中 tools + hooks 声明

- [x] **Step 2: 验证工具可用**
  Tools `agent`, `agent_status`, `agent_checkpoint` 在当前会话可见

### Task 3: 检查工具名冲突

- [x] **Step 1: 检查工具名冲突**
  `agent` / `agent_status` / `agent_checkpoint` 无冲突

### Task 4: 验证模型 API 连通性

- [x] **Step 1: 测试 Kimi**
  `curl https://opencode.ai/zen/go/v1/chat/completions` → 200

- [x] **Step 2: 测试 DeepSeek**
  `curl https://api.deepseek.com/v1/models` → 200

- [x] **Step 3: 测试 MiniMax**
  `curl https://api.minimax.chat/v1/models` → 200

### Task 5: 回归测试

- [x] **Step 1: 运行全部测试**
  Run: `bun test`
  Result: 20/20 pass

### Task 6: 写设计文档和实施计划

- [x] **Step 1: 写设计文档**
  File: `docs/superpowers/specs/2026-06-02-orchestrator-e2e-design.md`

- [x] **Step 2: 写入实施计划**
  File: `docs/superpowers/plans/2026-06-02-orchestrator-e2e.md`

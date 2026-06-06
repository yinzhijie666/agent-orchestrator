# Agent Orchestrator 审计报告

> 日期: 2026-06-05
> 方法: 完整工作流 69 步（Phase 1-4）
> 工具: Graphify + Understand + CodeGraph + verify.sh

---

## 执行摘要

| Phase      | 要求步骤 | 实际执行 | 完成率 | 失败/跳过                      | 数据来源 |
| ---------- | -------- | -------- | ------ | ------------------------------ | -------- |
| 1 知识图谱 | 4        | 4        | 100%   | MCP stdio 无后台持久化（可选） | 本次     |
| 2 技能加载 | 31       | 31       | 100%   | 无                             | -        |
| 3 深度分析 | 32       | 32       | 100%   | 无                             | 本次     |
| 4 审计验证 | 2        | 2        | 100%   | 无                             | -        |
| **总计**   | **69**   | **69**   | **100%** | -                            | -        |

---

## 项目问题清单

### P0 — 必须立即修复

#### 1. 无 API 认证

- **位置**: `server/index.js:36` — `handleRequest`
- **问题**: 所有 API 端点（/api/plan, /api/checkpoint, /api/thread, /api/status, /api/internal/event）无任何认证
- **影响**: 任何能访问端口的人都可以创建/修改/删除计划、线程、检查点
- **修复**: 添加 Bearer token 认证中间件，token 从 `process.env.AGENT_ORCHESTRATOR_API_KEY` 读取
- **验证**: 无 token 请求返回 401，有 token 请求正常

#### 2. 无 DB 迁移机制

- **位置**: `server/lib/db-schema.js:1` — `SCHEMA_SQL`
- **问题**: `CREATE TABLE IF NOT EXISTS` 只能建表，不能改表结构
- **影响**: 新版本需要新增列或改类型时，需要手动 `ALTER TABLE` 或删库重建
- **修复**: 在 `initSchema` 中添加版本检查 + 增量迁移逻辑
- **验证**: 模拟新增列场景，确认自动迁移成功

---

### P1 — 尽快修复

#### 3. 事件系统无重试

- **位置**: `server/lib/events.js:10` — `emit`
- **问题**: HTTP POST 到 `/api/internal/event` 失败只 `console.warn`，不重试
- **影响**: 关键事件（plan_created, checkpoint_verified）可能丢失
- **修复**: 添加 3 次指数退避重试，失败后写入 `activity_log` 表
- **验证**: 模拟网络错误，确认重试生效

#### 4. 模型降级链单一

- **位置**: `server/lib/model-clients/base-client.js:69` — `chatWithFallback`
- **问题**: 只做 1 次降级，不区分 429（rate limit）和 503（overload）
- **影响**: 高峰期可能 primary 和 fallback 同时失败
- **修复**: 添加 429 检测 + 指数退避重试（最多 3 次），503 触发 immediate fallback
- **验证**: 模拟 429 响应，确认退避重试

#### 5. CodeGraph MCP 进程泄漏

- **位置**: 系统级 — `codegraph serve --mcp`
- **问题**: 每次启动新实例不回收旧实例，长期运行后积累
- **影响**: verify.sh 检测到 8 个实例（预期 1 个），subprocess budget 失败
- **修复**: 在 `verify.sh` 中添加自动清理逻辑，或在 plugin 启动时检查并复用已有实例
- **验证**: 多次启动后实例数不超过 2

---

### P2 — 计划修复

#### 6. 配置碎片化

- **位置**: `server/config/default.json` 被 3 个文件独立导入
- **问题**: 无统一配置加载层，改配置需同步 plan.js, milestone-manager.js, checkpoint.js
- **修复**: 提取 `server/lib/config.js` 统一导出，其他文件改为 `import { config } from './config.js'`

#### 7. WebSocket 无心跳

- **位置**: `server/websocket/broadcaster.js`
- **问题**: 无心跳检测，客户端断连靠客户端自行重连
- **修复**: 添加 30s 间隔 ping，60s 无 pong 自动断开

#### 8. E2E 测试覆盖不足

- **位置**: `tests/e2e/`
- **问题**: 无完整 plan → execute → checkpoint → complete 流程测试
- **修复**: 添加 `tests/e2e/full-flow.test.js`

---

### P3 — 低优先级

#### 9. 无类型安全

- **问题**: 纯 JavaScript，schema 对齐靠人肉检查
- **修复**: 添加 JSDoc 类型注释，或渐进式迁移 TypeScript

#### 10. 工作流 token 消耗大

- **问题**: Phase 3 的 32 个分析命令中 ~30% 返回空结果（JavaScript 关键字查询）
- **修复**: 工作流增加 pilot query 验证步骤

---

## 工作流问题清单

| # | 问题                           | 严重程度 | 修复建议                         | 状态 |
| - | ------------------------------ | -------- | -------------------------------- | ---- |
| 1 | Graphify 0.8.30 无 `serve` 命令 | 可选     | 标记为可选，CLI 替代             | 已接受 |
| 2 | CodeGraph MCP 进程泄漏         | P1       | 启动前检查复用                   | ✅ 已修复 |
| 3 | 大量空结果查询                 | P3       | 先 pilot query 再批量            | 建议 |
| 4 | Understand Domain 未走完       | P2       | 验证 domain-analyzer.md 存在     | 建议 |
| 5 | 工作流 69 步 token 消耗大      | P3       | 引入 profile 系统（minimal/standard/full） | 建议 |

## 修复状态

| Task | 问题 | 优先级 | 状态 | Commit |
| ---- | ---- | ------ | ---- | ------ |
| 1 | API 认证中间件 | P0 | ✅ | acf02d0 |
| 2 | DB 迁移机制 | P0 | ✅ | 4532ffd |
| 3 | 事件系统重试 | P1 | ✅ | c4e4faf |
| 4 | 模型降级链增强 | P1 | ✅ | 09234a1 |
| 5 | CodeGraph MCP 进程管理 | P1 | ✅ | 53b8781 |
| 6 | 配置统一加载 | P2 | ✅ | 8947ee9 |
| 7 | WebSocket 心跳 | P2 | ✅ | 80a3e95 |
| 8 | E2E 测试补充 | P2 | ✅ | 6f96b0a |
| 9 | 工作流优化 | P3 | 建议 | - |
| 10 | 类型注释 | P3 | ✅ | 039879e |

---

## 架构概览

```
AgentOrchestratorPlugin (index.js:221)
├── executePlanTask (index.js:36)
│   ├── KimiClient.analyzeTaskMode — 决定 plan/build 模式
│   ├── KimiClient.generatePlan — 生成计划
│   ├── DeepSeekClient.executeTask — 执行任务
│   ├── chatWithFallback — 统一降级
│   └── emit* — 事件通知
├── PlanOrchestrator (server/lib/plan-orchestrator.js)
├── MilestoneManager (server/lib/milestone-manager.js)
├── AutoDispatcher (server/lib/auto-dispatcher.js)
├── AutoExecutor (server/lib/auto-executor.js)
├── SubagentRunner (server/lib/subagent-runner.js)
├── SkillClassifier (server/lib/skill-classifier.js)
├── DB (server/lib/db.js) — 28 connections
├── OpencodeServer (server/lib/opencode-server.js)
└── WebSocketBroadcaster (server/websocket/broadcaster.js)

API Routes:
├── /api/plan — 计划 CRUD
├── /api/checkpoint — 检查点管理
├── /api/thread — 线程管理
├── /api/status — 状态查询
└── /api/internal/event — 内部事件

Model Chain:
KimiClient (计划/分析) → DeepSeekClient (执行) → MiniMaxClient (只读)
降级: primary → fallback (1次)
```

---

## 图谱统计

- Graphify: 607 nodes, 793 edges, 43 communities
- Understand: 99KB knowledge graph
- CodeGraph: 59 files, 524 nodes, 784 edges, 0.90 MB

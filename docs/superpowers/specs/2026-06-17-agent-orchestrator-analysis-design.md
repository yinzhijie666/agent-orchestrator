# Agent Orchestrator — 设计文档

## 1. Architecture Overview

三层编排架构，Kimi K2.6 规划 → DeepSeek V4 Flash 执行 → OpenCode Zen 查询，运行在 OpenCode 插件 + 独立 Bun/SQLite 服务器之上。

```
OpenCode Environment (index.js 插件)
    │ Websocket + REST
Coordinator Server (Bun + SQLite, :8765)
    │
Kimi K2.6    DeepSeek V4    OpenCode Zen
(planning)   (execution)    (query)
```

## 2. Components

**Plugin** (`index.js`): 注册 4 个 OpenCode 工具 (`agent`, `agent_execute_skills`, `agent_status`, `agent_checkpoint`)。负责用户请求路由、plan 生成、item 按 executor 分发执行、recommendation 生成 + skill 提示。

**Coordinator Server** (`server/index.js`): Bun HTTP + WebSocket 服务器，提供 REST API (`/api/plans`, `/api/checkpoints`, `/api/threads`, `/api/status`)、WebSocket 实时事件广播、dashboard 静态文件、Prometheus metrics、health check。

**Models** (`server/lib/model-clients/*.js`): 三个 client 类均继承 `BaseModelClient`，通过 `chatWithFallback()` 实现 D1(DeepSeek)→D2(Zen) 降级链。KimiClient 额外提供 `analyzeTaskMode()` 和 `generateRecommendations()`。

**Supporting Lib** (27 files): EventBus、DB、PlanOrchestrator、AutoExecutor、AutoDispatcher(D1/D2)、SubagentRunner、SkillClassifier、CircuitBreaker、RateLimiter、Logger、Metrics 等。

**Dashboard** (`server/dashboard/`): HTML 实时监控页面，通过 WebSocket 接收 plan/checkpoint/item/fallback 事件。

## 3. Data Flow

```
用户请求 → agent 工具
  → Kimi.analyzeTaskMode() 判断 plan/build 模式
  → Plan 模式: Kimi 分析 + generateRecommendations(), 返回 analysis
  → Build 模式: PlanOrchestrator.generateAndPersist()
    → 遍历 planDoc.items, 按 executor 路由:
      - deepseek: DeepSeekClient.executeTask()
      - zen: ZenClient.searchCode()
      - kimi: skip (只规划不执行)
    → 每 4 个 item 触发 checkpoint (Kimi 审查)
    → Plan 完成后 generateRecommendations()
    → 返回 execSummary

SQLite schema: 7 张表 (plans, plan_items, checkpoints, threads, messages, activities, dispatches)
```

## 4. Error Handling

- **Model fallback**: 所有 LLM 调用通过 `BaseModelClient.chatWithFallback()`，主模型失败自动降级到备用模型
- **DB init failure**: Plugin 加载时 DB 初始化失败则 `db=null`，stateful 工具返回错误信息，不影响 plugin 整体加载
- **Item execution**: 单个 item 执行失败不影响其他 item，继续执行后续 item；最终 status 为 `completed_with_errors`
- **Circuit breaker**: 对 LLM API 调用有熔断机制，重复失败后暂停一段时间
- **Rate limiter**: 服务器端按 client key 限流，health/metrics 路径跳过

## 5. Testing Strategy

- **Unit tests** (`bun test`, ~58 tests, ~5s): 测试核心 lib 组件 (model clients、plan orchestrator、auto-executor、skill classifier、workflow validator)
- **E2E tests** (`bun test tests/e2e/`): 需要真实 API key，测试完整 LLM 调用链路
- **Model connectivity** (`bun run test:models`): 验证三个模型端点连通性
- **Health check**: `server/lib/health.js` 提供 liveness/readiness 端点
- **Audit**: `verify.sh` Phase 8 检查 9 项 (plugin 文件/签名/工具/注册/DB schema/端口/子进程/D2 状态/日志错误)

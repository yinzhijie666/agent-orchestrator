# Agent Orchestrator Bugfix Design

## 背景

基于 2026-06-09 审计发现的 6 个逻辑/设计问题，按模块分组修复。

## 修复范围

### Group 1: model-clients — Circuit Breaker 休眠 bug

- **文件**: `server/lib/circuit-breaker.js`, `server/lib/model-clients/base-client.js`
- **问题**: `base-client.js:72` 用 `circuitBreaker.call(async () => null)` 的返回值判断电路状态，
  当 action 返回 null 时误判为"电路断开"，导致不走主请求直接走 fallback。
- **方案**: 给 `CircuitBreaker` 加 `isOpen()` 方法，`base-client.js` 先显式检查 `!circuitBreaker.isOpen()`，
  再决定是否走 fallback，不再依赖 `call()` 返回值。

### Group 2: execution-pipeline — 移除 minimax + Kimi 跳过日志

- **文件**: `server/lib/plan-parser.js`, `server/lib/model-clients/kimi-client.js`,
  `server/lib/model-clients/minimax-client.js`, `index.js`
- **移除 minimax**:
  - `plan-parser.js:26` executor 白名单: `['kimi', 'deepseek', 'zen', 'minimax']` → `['kimi', 'deepseek', 'zen']`
  - `kimi-client.js:123` parsePlan 映射同步移除 minimax
  - `index.js:108` 删除 minimax 分支（Zen 保留，语义清晰）
  - 删除 `server/lib/model-clients/minimax-client.js`（如无其他引用）
- **Kimi 跳过日志**:
  - `index.js:94` 跳过 Kimi item 前写 `db.logActivity({ action: 'item_skipped' })`，
    并在 `execResults` 追加 skip 记录，用户可见。

### Group 3: auxiliary — 报告修正 + config 同步 + DB 索引

- **文件**: `server/lib/workflow-validator.js`, `server/lib/config.js`, `server/lib/db-schema.js`
- **WorkflowValidator**: Phase 3 改为两级状态 `index_available` / `used`，区分"索引已建"和"工具已实际使用"
- **Config**: `config.js` 补充 `dispatcher`、`milestone.verification_timeout_ms` 等缺失字段，对齐 `default.json`
- **DB 索引**：`SCHEMA_SQL` 末尾加 `CREATE INDEX IF NOT EXISTS`，覆盖 `plan_items.plan_id`、
  `checkpoints.plan_id`、`activity_log.plan_id`

## 实施顺序

Group 1 (无外部依赖) → Group 2 (无外部依赖) → Group 3 (可并行改)

## 验证

每组修复后跑 `bun test`，维持 319+ pass / 0 logic fail。

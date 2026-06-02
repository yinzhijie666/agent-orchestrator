# 真实 API 三层测试方案

## 文件
`tests/real-api.test.js`

## 覆盖的 Client
- KimiClient → `analyzeTaskMode`, `generatePlan`, `reviewCheckpoint`
- DeepSeekClient → `executeTask`, `generateCode`
- MiniMaxClient → `searchCode`, `readFileSummary`, `batchQuery`

## 四个 describe 块

### Layer 1: Kimi K2.6 (3 tests)
1. `analyzeTaskMode returns mode decision` — 返回 `{mode, reason}`
2. `generatePlan returns structured plan with items` — 返回含 items 数组的 Plan
3. `analyzeTaskMode + generatePlan full cycle` — mode=build → plan 含 deepseek/minimax 项

### Layer 2: DeepSeek V4 Flash (3 tests)
1. `executeTask returns completed status` — 简单函数任务
2. `executeTask handles coding tasks` — 含 acceptance_criteria 验证
3. `generateCode returns code with correct language` — 返回代码字符串

### Layer 3: MiniMax M3 (4 tests)
1. `searchCode returns informative text` — 返回非空回答
2. `readFileSummary returns concise summary` — 含文件路径和内容的摘要
3. `searchCode can handle codebase context` — 传入 context
4. `batchQuery runs multiple queries` — 2 个并行查询

### Three-Layer Chain (1 test)
完整链路：Kimi plan → DeepSeek execute → MiniMax search → Kimi review

## 安全机制
- `CI=true` 时自动 skip
- 检查 API key 格式（`sk-xxx`），无效则 skip
- `FORCE_REAL_API=true` 可在 CI 中强制运行
- 所有测试均有 30-180s 超时

## 运行方式
```bash
bun test tests/real-api.test.js --timeout 180000
```

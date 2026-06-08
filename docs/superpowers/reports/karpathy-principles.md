# Karpathy Coding Principles — Agent Orchestrator 项目应用

**生成时间**: 2026-06-08
**Skill**: andrej-karpathy

---

## 原则与项目实践

### 1. Write Minimal Code

本项目已实践：`server/lib/` 下每个模块职责单一，`base-client.js` 以约 100 行实现了三层 fallback 调用链。

### 2. Read the Manual

- 所有模型 API 调用走 `BaseModelClient.chatWithFallback()`，不直接 `fetch()`
- 配置按 `config/default.json` + `.env` 分层加载

### 3. Iterate Fast

- 测试驱动：`bun test` 覆盖 46 个文件 325 个用例
- E2E 测试走独立路径 `tests/e2e/`

### 4. Use the Debugger

- 结构化日志通过 `pino` + `Logger("server")`，支持 request tracing
- WebSocket Dashboard 实时查看事件流

### 5. Test the Edges

- 测试覆盖：fallback 链、断路器、速率限制、DB 迁移、并发 checkpoint
- 单元测试 + 集成测试 + E2E 三层

### 6. Ship Often

- CI 就绪：`workflow-preflight-check.sh` 验证 11 项前置条件
- `verify.sh` 保证每次提交前全量检查

### 7. Be Skeptical of LLM Output

- `PlanParser.validate()` 校验 Kimi 输出格式
- `parseSubagentResult()` 容错处理非 JSON 返回
- 断路器防止级联故障

### 8. Understand Before Generating

- Phase 1 工作流强制先构建知识图谱（Graphify + Understand + CodeGraph）
- `codegraph_context` / `codegraph_trace` 先查代码再改

### 9. Keep It Simple

- 三层架构：Plugin Layer → Server Layer → Library Layer
- AutoDispatcher 二选一：D1 (LLM) / D2 (Server)
- 无冗余抽象

### 10. Clean Up After Yourself

- `afterAll` 清理测试 DB、server 进程
- `.gitignore` 排除 build artifact、test DB、日志
- `cleanupLeakedServers()` 防止端口残留

---

*Adapted from Andrej Karpathy's software development philosophy.*

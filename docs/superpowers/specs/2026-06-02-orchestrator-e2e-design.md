# agent-orchestrator 端到端连通验证 — 设计文档

**日期:** 2026-06-02
**状态:** 已批准

## 目标

验证 agent-orchestrator 插件在 OpenCode 环境中的完整链路连通性：从插件加载 → 工具注册 → 服务器运行 → 模型 API 通信 → 状态查询，全部畅通。

## 范围

- 不涉及新功能开发、代码重构或架构调整
- 仅验证现有代码的连通性，修复发现的阻塞性问题

## 验证步骤

### S1. 启动 HTTP 服务器
- 命令：`nohup bun run server/index.js > /tmp/agent-orchestrator.log 2>&1 &`
- 预期：端口 8765 监听，控制台打印启动日志
- 验收：`curl http://127.0.0.1:8765/api/status` 返回 JSON

### S2. 验证插件加载
- 确认 `opencode.jsonc` 中已注册 `agent-orchestrator@~/agent-orchestrator`
- 确认 `package.json` 的 `main` 字段指向 `index.js`
- 确认 `opencode.json` 中 tools 和 hooks 声明正确
- 验收：插件 tools 在当前会话中可用

### S3. 检查工具名冲突
- 检查插件 tools（`agent`, `agent_status`, `agent_checkpoint`）是否与内置工具或其他插件冲突
- 验收：无冲突，无需重命名

### S4. 验证模型 API 连通性
- Kimi K2.6 via `https://opencode.ai/zen/go/v1`（`OPENCODE_API_KEY`）
- DeepSeek V4 Flash via `https://api.deepseek.com/v1`（`DEEPSEEK_API_KEY`）
- MiniMax M3 via `https://api.minimax.chat/v1`（`MINIMAX_API_KEY`）
- 验收：三个端点均返回 200

### S5. 回归测试
- `bun test` 全部通过
- 验收：20/20 pass

### S6. 故障修复
- 测试隔离问题：测试启动自己的服务器实例导致 EADDRINUSE
- 修复：测试前停止已有进程，测试后重启

## 回滚策略

- Git 未提交的变更：`git checkout -- <file>` 恢复
- 服务器端口冲突：修改 `AGENT_ORCHESTRATOR_PORT` 换端口
- 工具名冲突：改为 `orchestrator_task`、`orchestrator_status`、`orchestrator_checkpoint`

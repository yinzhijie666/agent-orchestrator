# Agent Orchestrator — Project Rules

## 行为准则

- 用中文回复（除非用户用英文提问）
- 任务执行前先思考，不要急着写代码
- 改动最小化，不要"顺手"优化
- 多步任务先列计划再执行

## 项目特定规则

- 改 `index.js` / `server/*` 前必须先写测试
- DB schema 变更要同步更新 `init.js` 和 `migrate.js`
- API key 只能在 `.env` 读，不要硬编码
- 提示词改动需要更新 `tests/prompts.test.js` 中的断言
- 三层模型调用走 `BaseModelClient.chatWithFallback()`，不要直接 `fetch()`

## Skill Auto-Execution Protocol (MUST)

After any `agent` tool call, you MUST:

1. **If output contains `💡 建议后续:`** → call `agent_execute_skills` tool
2. **Execute returned skills in priority order**: P0 (blocking) → P1 (important) → P2 (optional)
3. **Do NOT skip P0 items** under any circumstance
4. **Do NOT silently ignore** the suggested_skills section

Each entry type maps to:
- `skill X` → call `skill X` tool
- `/command` → call that command
- `codegraph_X` → call that codegraph tool
- `oh-my-memory search` → search memory vault

## Routing Rule

- All user requests → silently call `agent task="<request>"` first
- Do NOT ask the user to call `agent` themselves
- For simple questions, agent will choose `plan` mode automatically

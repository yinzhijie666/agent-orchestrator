# Agent Orchestrator — Project Rules

## 行为准则

- 用中文回复（除非用户用英文提问）
- 任务执行前先思考，不要急着写代码
- 改动最小化，不要"顺手"优化
- 多步任务先列计划再执行

## 项目特定规则

- 改 `index.js` / `server/*` 前必须先写测试
- DB schema 变更要同步更新 `server/index.js:25-90` 中的 `initDb.exec(...)`
- API key 只能在 `.env` 读，不要硬编码
- 提示词改动需要更新 `tests/prompts.test.js` 中的断言
- 三层模型调用走 `BaseModelClient.chatWithFallback()`，不要直接 `fetch()`

## 完整工作流

执行完整工作流前，运行前置检查：
```bash
bash scripts/workflow-preflight-check.sh
```

工作流定义见 [WORKFLOW.md](~/.config/opencode/WORKFLOW.md)（Phase 1-4 纯分析流程）。

**核心区分：**
- **Phase 1-4**（工作流）= 纯分析，不修改代码，不触发 P0 技能
- **Phase 5**（问题修复）= 实施活动，修改代码，触发 P0 技能

## 问题修复

审计或分析发现问题后，执行问题修复流程（Phase 5）：
1. 输出问题清单
2. 制定修复方案（writing-plans）
3. 逐个 Task 修复（TDD + verification）
4. finishing-a-development-branch

详细流程见 [AUDIT.md](~/.config/opencode/AUDIT.md)。

## P0 技能触发规则

P0 技能在**问题修复阶段**触发，不在工作流分析阶段触发：

| P0 技能             | 触发条件                     | 验证                |
| ------------------- | ---------------------------- | ------------------- |
| brainstorming       | 任何新功能/修改/重构前       | spec doc 存在       |
| writing-plans       | brainstorming 完成后         | plan doc 存在       |
| TDD                 | 任何代码变更                 | RED→GREEN→REFACTOR  |
| verification        | 任何"完成"声明前             | 5 步 Gate Function  |
| finishing-branch    | 实施完成                     | 用户选择 4 选项     |

## Skill Auto-Execution Protocol

After any `agent` tool call, you MUST:
1. If output contains `💡 建议后续:` → call `agent_execute_skills` tool
2. Execute returned skills in priority order: P0 → P1 → P2
3. Do NOT skip P0 items under any circumstance

## Routing Rule

- 所有用户请求 → 静默调用 `agent task="<request>"` 优先
- 不要让用户自己调 `agent`
- 简单问题, agent 会自动选 `plan` 模式

---

## 项目审计 checklist

以下 checklist 针对 agent-orchestrator 项目，Phase 4 审计时必须执行。
通用审计 checklist 见 [AUDIT.md](~/.config/opencode/AUDIT.md)。

### Round 1-3: Full Audit

- Schema duplication（plugin vs server vs tests）
- Path consistency（plugin vs API behavior）
- D1/D2 fallback chain
- Dispatcher counter semantics
- Dashboard real-time events
- HTTP bridge（plugin → server）

### Round 4: Prompt + Skills Alignment

- AutoExecutor output schema vs SubagentRunner input schema
- `json_mode` vs output format consistency
- `suggested_skills` default values（`{}` vs `[]`）
- `CAPABILITY_LIST` shared constant extraction
- Empty skills check（no header when no skills）
- `reviewCheckpoint` plan context

### Round 5: D1 Skills Execution

- D1 subagent has no tool access（raw LLM API call）
- Verify `completedSkills.length` check after dispatch
- Verify `auto_exec=null` when no skills completed
- Verify fallback path triggers correctly

### Round 6: Fallback Clarity

- `generateRecommendations` uses `CAPABILITY_LIST`
- system.transform fallback instructions updated
- `dispatch_result` condition（only when `autoDispatched=true`）
- `next_step` wording accuracy

### Round 7: Global Config Consistency

- Global CLAUDE.md loaded via OpenCode `instructions` field
- CLAUDE.md aligned with system.transform
- CAPABILITY_LIST includes all available capabilities
- Cross-reference with CLAUDE.md and CAPABILITIES.md

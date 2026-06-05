# Agent Orchestrator — 审计流程

## 概述

审计是独立于完整工作流 Phase 1-4 的活动。Phase 1-4 是纯分析流程（不修改代码），审计修复是实施活动（修改代码）。

---

## Phase 4: 审计验证（工作流的一部分）

### orchestrator-audit 7 轮 checklist

审计必须执行以下 7 轮 checklist，每轮有特定 focus：

**Round 1-3: Full Audit**
- Schema duplication（plugin vs server vs tests）
- Path consistency（plugin vs API behavior）
- D1/D2 fallback chain
- Dispatcher counter semantics
- Dashboard real-time events
- HTTP bridge（plugin → server）

**Round 4: Prompt + Skills Alignment**
- AutoExecutor output schema vs SubagentRunner input schema
- `json_mode` vs output format consistency
- `suggested_skills` default values（`{}` vs `[]`）
- `CAPABILITY_LIST` shared constant extraction
- Empty skills check（no header when no skills）
- `reviewCheckpoint` plan context

**Round 5: D1 Skills Execution**
- D1 subagent has no tool access（raw LLM API call）
- Verify `completedSkills.length` check after dispatch
- Verify `auto_exec=null` when no skills completed
- Verify fallback path triggers correctly

**Round 6: Fallback Clarity**
- `generateRecommendations` uses `CAPABILITY_LIST`
- system.transform fallback instructions updated
- `dispatch_result` condition（only when `autoDispatched=true`）
- `next_step` wording accuracy

**Round 7: Global Config Consistency**
- Global CLAUDE.md loaded via OpenCode `instructions` field
- CLAUDE.md aligned with system.transform
- CAPABILITY_LIST includes all available capabilities
- Cross-reference with CLAUDE.md and CAPABILITIES.md

### verify.sh

运行 `bash verify.sh` 进行全量检查（26 项 Golden Checks）。

---

## Phase 5: 审计修复（独立活动）

审计修复是独立于工作流 Phase 1-4 的实施活动。P0 技能在本阶段触发。

### 触发条件

当 Phase 4 审计发现问题需要修复时，进入 Phase 5。

### 流程

1. **输出审计报告** → `.gstack/orchestrator-audit/`
2. **制定修复方案** → `docs/superpowers/plans/`
3. **brainstorming（P0）** — 为每个修复 Task 确认需求
   - 1-by-1 询问用户需求
   - 提出 2-3 方案
   - 等待用户明确批准
   - 输出 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
   - 验证：spec doc 存在
4. **writing-plans（P0）** — 生成详细 plan
   - 生成 plan doc 到 `docs/superpowers/plans/`
   - 每个 task 2-5 分钟，step-by-step
   - 验证：plan doc 存在
5. **逐个 Task 执行**：
   a. RED: 写失败测试
   b. 验证失败
   c. GREEN: 最小实现
   d. 验证通过
   e. REFACTOR
   f. commit
6. **verification-before-completion（P0）** — 每个 Task 完成后验证
   - 5 步 Gate Function
   - 验证：输出包含命令+输出
7. **finishing-a-development-branch（P0）** — 所有 Task 完成后
   - 检测环境
   - 4 选项（merge/PR/keep/discard）
   - 验证：用户明确选择

### P0 技能触发条件

| 技能             | 触发条件                     | 验证             |
| ---------------- | ---------------------------- | ---------------- |
| brainstorming    | 审计发现新问题需要设计方案时 | spec doc 存在    |
| writing-plans    | brainstorming 完成后         | plan doc 存在    |
| TDD              | 每个 Task 代码变更前         | 测试先失败再通过 |
| verification     | 每个 Task 完成声明前         | 5 步 Gate 通过   |
| finishing-branch | 所有 Task 完成后             | 用户选择选项     |

### P0 技能执行失败的降级路径

如 P0 技能无法执行，必须遵循以下步骤：
1. **立即停止**后续工作流
2. **明确标注** "P0 技能 {name} 未执行，原因: {reason}"
3. **列出产物缺失项**：spec doc / plan doc / test commit / debug report / 选项对话
4. **请求用户决定**：继续（接受缺失）/ 等待（用户提供输入）/ 取消（放弃本次）
5. **禁止**在 P0 技能缺失时输出"完成"声明

---

## Phase 5 vs Phase 1-4 区别

| 维度     | 工作流 Phase 1-4  | 审计修复 Phase 5       |
| -------- | ----------------- | ---------------------- |
| 目的     | 分析理解代码      | 修复发现问题           |
| 代码修改 | 不允许            | 允许                   |
| P0 技能  | 不触发            | 触发                   |
| 产物     | 知识图谱+审计报告 | 代码变更+测试          |
| 自检     | 每个 Phase 结束   | 每个 Task 完成         |
| 验证     | verify.sh         | TDD + verification gate |

---

## 审计报告格式

审计报告输出到 `.gstack/orchestrator-audit/audit-report-YYYY-MM-DD.md`，包含：
- 审计日期和范围
- 发现的问题列表（按 P0/P1/P2/P3 分级）
- 修复建议
- 执行摘要表

---

## 工具完整性检查（审计前置条件）

在审计开始前，验证所有工具已调用：

**知识图谱构建：**
- [ ] `graphify-out/graph.json` 存在
- [ ] `.understand-anything/knowledge-graph.json` 存在
- [ ] `codegraph status` 显示索引正常

**原则加载：**
- [ ] `skill andrej-karpathy` 已执行
- [ ] Superpowers skills 已按需加载
- [ ] GStack skills 已按需加载

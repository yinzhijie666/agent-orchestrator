# Phase 2 & 5 Skills 执行设计方案（v3.2）

> 修订日期: 2026-06-08
> 版本: v3.2
> 核心变更：Phase 2 拆为纯分析（14 skills），Phase 5 实施（14 skills），共 28 skills。
> v3.2 撤销 v3.1 错误合并（恢复 `plan-design-review`），删 2 冗余（`debug` + `subagent-driven-development`），移 1 到正确 Phase（`verification-before-completion` → Phase 5）。

## v3.1 → v3.2 修复明细

| Bug | v3.1 错误 | v3.2 修复 |
|-----|-----------|-----------|
| 🔴 `verification-before-completion` 在 Phase 2 无验证目标 | 放在 Phase 2 组 2 | 移到 Phase 5.2 |
| 🟡 SAD + DPA 互斥 | 两者都在 Phase 5.2 | 删 SAD，DPA 保留 |
| 🟡 `design-review` 不实际支持架构审查 | 错误合并 `plan-design-review` | **恢复 `plan-design-review`** |
| ⚪ `debug` + `systematic-debugging` 重叠 | 两者都在 Phase 2 组 2 | 删 `debug` |
| 🟡 `browse` 条件苛刻 | 放在 Phase 5.2 | 标为条件性（仅前端变更） |
| ⚪ Standard 有验证无修复 | Profile 选择问题 | 加注释说明 |
| ⚪ Minimal 无前置分析 | Profile 选择问题 | 加注释说明 |

## 新 Phase 结构

```
Phase 1: 知识图谱（4 步，不变）
  graphify . + /understand + codegraph init -i + graphify . --mcp

Phase 2: 技能分析（14 skills）
  组 1 分析(7) + 组 2 验证(6) + retro(1)
  纯分析 + 报告产出，不修改代码

Phase 3: 深度分析（32 步，不变）
  Understand(7) + CodeGraph(9) + Graphify(16)

Phase 4: 审计（7 轮）
  orchestrator-audit 7 rounds + verify.sh

Phase 5: 实施（14 skills）
  基于 Phase 4 bug list 修复 + 文档 + 收尾
```

## Phase 2：技能分析（14 skills）

纯分析阶段，不修改代码，产出 `docs/phase2-skills/` 报告。

### 组 1 — 分析（7 skills，按顺序执行）

| Skill | 执行内容 | 产出文件 |
|-------|---------|----------|
| `andrej-karpathy` | 加载编码原则，对项目做 10 原则评分 | `01-karpathy-principles.md` |
| `brainstorming` | 项目全面脑暴，产出改进方向 spec | `02-brainstorming.md` |
| `plan-eng-review` | 审查项目架构(plugin/server/db/API) | `03-architecture-review.md` |
| `plan-design-review` | ← **恢复**。审查设计模式(events/checkpoint/dispatch) | `04-design-pattern-review.md` |
| `design-consultation` | 设计建议(API/WS/dashboard) | `05-design-consultation.md` |
| `plan-ceo-review` | 项目方向与战略评估 | `06-direction-review.md` |
| `office-hours` | YC 式项目方向问诊 | `07-office-hours.md` |

### 组 2 — 质量验证（6 skills，可并行）

| Skill | 执行内容 | 产出文件 |
|-------|---------|----------|
| `review` | 代码审查，找具体代码问题 | `08-review.md` |
| `design-review` | UI 审查（需 browser）| `09-design-review.md` |
| `qa` | 全功能 QA | `10-qa.md` |
| `qa-only` | 仅 QA 不改代码 | `11-qa-only.md` |
| `systematic-debugging` | 系统性扫描代码问题（覆盖 debug 职责）| `12-systematic-debugging.md` |
| `gstack-upgrade` | 环境健康检查 | `13-gstack-upgrade.md` |

> `debug` 已合并到 `systematic-debugging`（覆盖 debug 全部职责）。
> `verification-before-completion` 移到 Phase 5.2（需要一个有代码变更的环境才有验证意义）。

### 组 3 — 回顾（1 skill，收尾）

| Skill | 执行内容 | 产出文件 |
|-------|---------|----------|
| `retro` | git 历史回顾报告 | `14-retro.md` |

### Phase 2 验证

```bash
# 确认 Phase 2 完成
ls docs/phase2-skills/*.md | wc -l
# 预期: 14 个文件

# 测试无回归
bun test
```

## Phase 5：实施（14 skills）

基于 Phase 4 审计发现的 bug list 实施修复。

### Phase 5.1 — 规划（2 skills）

| Skill | 执行内容 | 产出 |
|-------|---------|------|
| `using-git-worktrees` | 隔离工作区 | worktree 创建 |
| `writing-plans` | 基于 Phase 4 bug list 制定修复计划 | `docs/phase5/fix-plan.md` |

### Phase 5.2 — 修复（4 skills）

| Skill | 执行内容 | 验证 |
|-------|---------|------|
| `dispatching-parallel-agents` | 并发调度修复任务（子 agent 各自执行 TDD+实现）| agent 并行结果 |
| `verification-before-completion` | 汇聚子 agent 结果，验证全部修复无回归 | bun test + verify.sh |
| `browse` | browser 截图验证（仅前端变更时执行）| `docs/phase5/browse.md` + 截图 |
| `finishing-a-development-branch` | commit 或 PR | commit |

> DPA 派发后，子 agent 各自执行 TDD + 实现。主 session 跳过 TDD/executing-plans（已在子 agent 内部完成）。

### Phase 5.3 — 文档与发布（3 skills）

| Skill | 执行内容 | 产出 |
|-------|---------|------|
| `document-release` | 更新 README 等文档 | `docs/phase5/document-release.md` |
| `writing-skills` | 可选。为项目写 `agent-orchestrator-workflow` skill | 新 SKILL.md |
| `ship` | 发布准备检查 | `docs/phase5/ship.md` |

### Phase 5.4 — 交互收尾（3 skills，需用户参与）

| Skill | 执行内容 |
|-------|---------|
| `requesting-code-review` | 请求审查最终代码 |
| `receiving-code-review` | 响应审查意见 |
| `setup-browser-cookies` | browser session 设置 |

### Phase 5 验证

```bash
# 测试全部通过
bun test

# Phase Gate 验证
bash /home/yin/.config/opencode/scripts/workflow-phase.sh --complete phase5
```

## Profile 适配

| Profile | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | 总步数 | 耗时 | 说明 |
|---------|---------|---------|---------|---------|---------|--------|------|------|
| minimal | 4 步 | ❌ skip | ❌ skip | 1 步 | ❌ skip | 5 | 5 min | 仅快速自检，无分析无修复 |
| standard | 4 步 | 组 1(7)+组 2(6) | ❌ skip | 2 步 | ❌ skip | 19 | 15 min | 分析+验证，产出问题报告供后续手动修复 |
| full | 4 步 | 全部 14 | 32 步 | 2 步 | 全部 14 | 66 | 90 min | 全量：分析→验证→审计→修复→文档 |
| audit | 4 步 | 全部 14 | 32 步 | 7 轮 | 全部 14 | 71 | 120 min | full + 深度审计 |

## 执行前置条件

```bash
# Knowledge graph ready
ls graphify-out/graph.json
ls .understand-anything/knowledge-graph.json
codegraph status

# Test baseline
bash scripts/test-baseline.sh --save

# Profile init
bash /home/yin/.config/opencode/scripts/workflow-phase.sh --init full
```

## 错误处理

| 失败模式 | 处理策略 |
|---------|----------|
| skill 加载失败 | 记录错误，继续下一个 |
| 测试失败 | 记录失败详情，不阻塞后续 skill |
| browser 不可用 | 跳过 Phase 5.2 browse，标注 |
| 服务器未启动 | 跳过 QA/design-review，标注 |
| 审计发现无代码修复 | writing-plans 产出设计文档 |

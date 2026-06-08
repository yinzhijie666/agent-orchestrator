# Phase 2 & 5 Skills 执行设计方案（v3）

> 修订日期: 2026-06-08
> 版本: v3.1
> 核心变更：Phase 2 拆为纯分析（15 skills），组 3（工程实施）移入 Phase 5（15 skills），消除循环依赖和范围重叠。
> v3.1 修复：Group 1 去重 1 skill + Phase 5 执行顺序重整。

## v2 → v3 重构原因

| Bug | 根因 | v3 解法 |
|-----|------|---------|
| 🔴 Phase 2 组 3 与 Phase 4 循环依赖 | 组 3 需要审计发现但审计在 Phase 4 | 组 3 移入 Phase 5，审计先行 |
| 🔴 组 3 违反"Phase 1-4 纯分析"契约 | Phase 2 包含代码修改 | Phase 1-4 恢复纯分析 |
| 🟠 组 3 与 Phase 5 范围重叠 | 两者都做 TDD+修复 | 组 3 = Phase 5，消除重复 |
| 🟡 Karpathy 位置错误 | 在组 4 末尾 | 移到 Phase 2 组 1 首位 |
| 🟡 Gate 不验证产出 | 只标记状态不检查文件 | `--complete` 增加产物检查 |
| ⚪ Profile 缺 Phase 5 | profiles 只定义了 Phase 1-4 | 全部 profile 加 Phase 5 |
| ⚪ 硬编码项目路径 | workflow-phase.sh 写死路径 | 环境变量/参数替代 |

## v3 → v3.1 修复明细

| Bug | 修复 |
|-----|------|
| 🟡 Group 1 plan-review 无 plan 可审查 | 删 `plan-design-review`（已有 `design-review` 在 Group 2） |
| 🟡 Phase 5.2 顺序颠倒 | 重构：subagent/dispatch → TDD → verification → browse → commit |
| ⚪ worktree 位置 | 移到 Phase 5.1 首位 |
| ⚪ browse 位置 | 移到 Phase 5.2（verification 后） |
| ⚪ writing-skills 无 topic | 预定义 topic: `agent-orchestrator-workflow` |
| ⚪ minimal 步数 | total_steps 6 → 5（与 phase 1+4 实际计数一致） |

## 新 Phase 结构

```
Phase 1: 知识图谱（4 步，不变）
  graphify . + /understand + codegraph init -i + graphify . --mcp

Phase 2: 技能分析（16 skills）
  组 1 分析(7) + 组 2 验证(8) + retro(1)
  纯分析 + 报告产出，不修改代码

Phase 3: 深度分析（32 步，不变）
  Understand(7) + CodeGraph(9) + Graphify(16)

Phase 4: 审计（7 轮）
  orchestrator-audit 7 rounds + verify.sh

Phase 5: 实施（15 skills）
  基于 Phase 4 bug list 修复 + 文档 + 收尾
```

## Phase 2：技能分析（15 skills）

纯分析阶段，不修改代码，产出 `docs/phase2-skills/` 报告。

### 组 1 — 分析（6 skills，按顺序执行）

| Skill | 执行内容 | 产出文件 |
|-------|---------|----------|
| `andrej-karpathy` | 加载编码原则，对项目做 10 原则评分 | `01-karpathy-principles.md` |
| `brainstorming` | 项目全面脑暴，产出改进方向 spec | `02-brainstorming.md` |
| `plan-eng-review` | 审查项目架构(plugin/server/db/API) | `03-architecture-review.md` |
| `design-consultation` | 设计建议(API/WS/dashboard) | `04-design-consultation.md` |
| `plan-ceo-review` | 项目方向与战略评估 | `05-direction-review.md` |
| `office-hours` | YC 式项目方向问诊 | `06-office-hours.md` |

> `plan-design-review` 已合并到组 2 的 `design-review`（检查 UI/设计模式）。

### 组 2 — 质量验证（8 skills，可并行）

| Skill | 执行内容 | 产出文件 |
|-------|---------|----------|
| `review` | 代码审查，找具体代码问题 | `07-review.md` |
| `design-review` | 审查设计模式 + UI（含 `plan-design-review` 职责）| `08-design-review.md` |
| `qa` | 全功能 QA | `09-qa.md` |
| `qa-only` | 仅 QA 不改代码 | `10-qa-only.md` |
| `systematic-debugging` | 系统性扫描代码问题 | `11-systematic-debugging.md` |
| `verification-before-completion` | 项目当前健康度验证 | `12-verification.md` |
| `debug` | 对发现的 bug 做深度分析 | `13-debug.md` |
| `gstack-upgrade` | 环境健康检查 | `14-gstack-upgrade.md` |

### 组 3 — 回顾（1 skill，收尾）

| Skill | 执行内容 | 产出文件 |
|-------|---------|----------|
| `retro` | git 历史回顾报告 | `15-retro.md` |

### Phase 2 验证

```bash
# 确认 Phase 2 完成
ls docs/phase2-skills/*.md | wc -l
# 预期: 15 个文件

# 测试无回归
bun test
```

## Phase 5：实施（15 skills）

基于 Phase 4 审计发现的 bug list 实施修复。

### Phase 5.1 — 规划（2 skills）

| Skill | 执行内容 | 产出 |
|-------|---------|------|
| `using-git-worktrees` | 隔离工作区 | worktree 创建 |
| `writing-plans` | 基于 Phase 4 bug list 制定修复计划 | `docs/phase5/fix-plan.md` |

### Phase 5.2 — 修复（7 skills）

| Skill | 执行内容 | 验证 |
|-------|---------|------|
| `subagent-driven-development` | 并行拆分修复任务 | 各 agent 独立产出 |
| `dispatching-parallel-agents` | 调度并发修复任务 | agent 并行结果 |
| `test-driven-development` | RED: 为每个修复写测试 | `bun test` 新测试失败 |
| `executing-plans` | GREEN: 实施修复代码 | `bun test` 全部通过 |
| `verification-before-completion` | 验证全部修复无回归 | bun test + verify.sh |
| `browse` | browser 截图验证（前端变更）| `docs/phase5/browse.md` + 截图 |
| `finishing-a-development-branch` | commit 或 PR | commit |

### Phase 5.3 — 文档与发布（3 skills）

| Skill | 执行内容 | 产出 |
|-------|---------|------|
| `document-release` | 更新 README 等文档 | `docs/phase5/document-release.md` |
| `writing-skills` | 为项目写 `agent-orchestrator-workflow` skill | 新 SKILL.md |
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

| Profile | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | 总步数 | 耗时 |
|---------|---------|---------|---------|---------|---------|--------|------|
| minimal | 4 步 | ❌ skip | ❌ skip | 1 步 | ❌ skip | 5 | 5 min |
| standard | 4 步 | 组 1(6)+组 2(8) | ❌ skip | 2 步 | ❌ skip | 20 | 15 min |
| full | 4 步 | 全部 15 | 32 步 | 2 步 | 全部 15 | 68 | 90 min |
| audit | 4 步 | 全部 15 | 32 步 | 7 轮 | 全部 15 | 73 | 120 min |

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
| browser 不可用 | 跳过 Phase 5.2 browse + 5.3 ship，标注 |
| 服务器未启动 | 跳过 QA/design-review，标注 |
| 审计发现无代码修复 | writing-plans 产出设计文档 |

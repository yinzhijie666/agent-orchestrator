# Phase 2 & 5 Skills 执行设计方案（v3）

> 修订日期: 2026-06-08
> 版本: v3
> 核心变更：Phase 2 拆为纯分析（16 skills），组 3（工程实施）移入 Phase 5（15 skills），消除循环依赖和范围重叠。

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

## Phase 2：技能分析（16 skills）

纯分析阶段，不修改代码，产出 `docs/phase2-skills/` 报告。

### 组 1 — 分析（7 skills，按顺序执行）

| Skill | 执行内容 | 产出文件 |
|-------|---------|----------|
| `andrej-karpathy` | 加载编码原则，对项目做 10 原则评分 | `01-karpathy-principles.md` |
| `brainstorming` | 项目全面脑暴，产出改进方向 spec | `02-brainstorming.md` |
| `plan-eng-review` | 审查三层架构(plugin/server/db) | `03-plan-eng-review.md` |
| `plan-design-review` | 审查设计模式(events/checkpoint/dispatch) | `04-plan-design-review.md` |
| `plan-ceo-review` | 项目方向与战略评估 | `05-plan-ceo-review.md` |
| `design-consultation` | 设计建议(API/WS/dashboard) | `06-design-consultation.md` |
| `office-hours` | YC 式项目方向问诊 | `07-office-hours.md` |

### 组 2 — 质量验证（8 skills，可并行）

| Skill | 执行内容 | 产出文件 |
|-------|---------|----------|
| `review` | 代码审查，找具体代码问题 | `08-review.md` |
| `design-review` | 审查 dashboard UI | `09-design-review.md` |
| `qa` | 全功能 QA | `10-qa.md` |
| `qa-only` | 仅 QA 不改代码 | `11-qa-only.md` |
| `systematic-debugging` | 系统性扫描代码问题 | `12-systematic-debugging.md` |
| `verification-before-completion` | 项目当前健康度验证 | `13-verification.md` |
| `debug` | 对发现的 bug 做深度分析 | `14-debug.md` |
| `gstack-upgrade` | 环境健康检查 | `15-gstack-upgrade.md` |

### 组 3 — 回顾（1 skill，收尾）

| Skill | 执行内容 | 产出文件 |
|-------|---------|----------|
| `retro` | git 历史回顾报告 | `16-retro.md` |

### Phase 2 验证

```bash
# 确认 Phase 2 完成
ls docs/phase2-skills/*.md | wc -l
# 预期: 16 个文件

# 测试无回归
bun test
```

## Phase 5：实施（15 skills）

基于 Phase 4 审计发现的 bug list 实施修复。

### Phase 5.1 — 规划（2 skills）

| Skill | 执行内容 | 产出 |
|-------|---------|------|
| `writing-plans` | 基于 Phase 4 bug list 制定修复计划 | `docs/phase5/fix-plan.md` |
| `using-git-worktrees` | 隔离工作区 | worktree 创建 |

### Phase 5.2 — 修复（6 skills）

| Skill | 执行内容 | 验证 |
|-------|---------|------|
| `test-driven-development` | RED: 为每个修复写测试 | `bun test` 新测试失败 |
| `executing-plans` | GREEN: 实施修复代码 | `bun test` 全部通过 |
| `verification-before-completion` | 验证修复无回归 | bun test + verify.sh |
| `subagent-driven-development` | 并行修复独立模块 | 各 agent 独立产出 |
| `dispatching-parallel-agents` | 调度并发任务 | agent 并行结果 |
| `finishing-a-development-branch` | commit 或 PR | commit |

### Phase 5.3 — 文档与发布（4 skills）

| Skill | 执行内容 | 产出 |
|-------|---------|------|
| `document-release` | 更新 README 等文档 | `docs/phase5/document-release.md` |
| `writing-skills` | 为项目建立复用 skill | 新 SKILL.md |
| `ship` | 发布准备检查 | `docs/phase5/ship.md` |
| `browse` | browser 截图验证 | `docs/phase5/browse.md` + 截图 |

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
| minimal | 4 步 | retro 仅 1 | ❌ skip | 1 步 | ❌ skip | 6 | 5 min |
| standard | 4 步 | 组 1(7)+组 2(8) | ❌ skip | 2 步 | ❌ skip | 21 | 15 min |
| full | 4 步 | 全部 16 | 32 步 | 2 步 | 全部 15 | 69 | 90 min |
| audit | 4 步 | 全部 16 | 32 步 | 7 轮 | 全部 15 | 74 | 120 min |

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
| browser 不可用 | 跳过 Phase 5.3 browser/ship，标注 |
| 服务器未启动 | 跳过 QA/design-review，标注 |
| 审计发现无代码修复 | writing-plans 产出设计文档 |

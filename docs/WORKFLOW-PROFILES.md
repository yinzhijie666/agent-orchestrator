# 工作流 Profile 系统

> **目的**：让"完整工作流"从一刀切的 69 步变成按需选择，避免日常开发也跑全量。
> 2026-06-08 更新 (v3)：Phase 2 拆为纯分析（16 skills），组 3（工程实施）移入 Phase 5（15 skills）。

## Design Rationale

### v2 的问题

v2 将 Phase 2 分为 5 组，其中组 3（工程实施）包含 TDD/executing-plans 等代码修改操作，导致：
- **循环依赖**：组 3 需要审计发现（Phase 4）才能执行，但 Phase 4 在 Phase 2 之后
- **契约违反**：Phase 1-4 定义为"纯分析"，但组 3 写代码
- **范围重叠**：组 3 与 Phase 5 做完全相同的事

### v3 的解法

**Phase 2 拆为纯分析**（16 skills）+ **Phase 5（15 skills）**：

```
Phase 1: 知识图谱 (4 步，不变)
  graphify + /understand + codegraph + mcp

Phase 2: 技能分析 (16 skills)
  纯分析 + 报告产出，不修改代码

Phase 3: 深度分析 (32 步，不变)
  Understand(7) + CodeGraph(9) + Graphify(16)

Phase 4: 审计 (7 轮)
  产出 bug list + optimization list

Phase 5: 实施 (15 skills)
  基于 Phase 4 bug list 修复 + 文档 + 收尾
```

## Profile 一览

| Profile  | Phase 1 | Phase 2       | Phase 3  | Phase 4 | Phase 5   | 总步数 | 实际耗时  | 适用场景                               |
| -------- | ------- | ------------- | -------- | ------- | --------- | ------ | --------- | -------------------------------------- |
| minimal  | ✅ 4    | ❌ (仅 retro) | ❌ skip  | ✅ 1 项 | ❌ skip   | 6      | 5-10 min  | 日常 commit 前自检                     |
| standard | ✅ 4    | ✅ 组 1+2     | ❌ skip  | ✅ 2 项 | ❌ skip   | 21     | 15-25 min | 重大功能前（推荐默认）                 |
| full     | ✅ 4    | ✅ 全部 16    | ✅ 32    | ✅ 2 项 | ✅ 全部   | 69     | 60-90 min | 发版、重大重构                         |
| audit    | ✅ full | ✅ 全部 16    | ✅ 32    | ✅ 7轮  | ✅ 全部   | 74     | 90-120 min| 审计场景，自动产出 audit-report        |

> 注：minimal 标准不含 retro，仅验证和提交前检查。需要回顾时手动执行 `skill retro`。

## Profile 详细说明

### minimal（6 步）

**触发词**："快速检查" / "commit 前" / "日常自检"

| Phase | 步骤                             | 验证                  |
| ----- | -------------------------------- | --------------------- |
| 1     | graphify . + /understand + codegraph | 3 个图谱存在        |
| 4     | verify.sh 全量检查                | Golden 28 通过        |

**跳过**：Phase 2（分析）、Phase 3（深度分析）、Phase 5（实施）。

### standard（21 步）

**触发词**："跑标准" / "重大功能前" / 默认

| Phase | 步骤                        | 验证                     |
| ----- | --------------------------- | ------------------------ |
| 1     | 4 个知识图谱工具             | 3 份图谱存在              |
| 2     | 组 1(7) + 组 2(8) = 15 skills | 15 个 `docs/phase2-skills/` |
| 4     | orchestrator-audit + verify  | 审计通过 + Golden 28     |

**不包含**：Phase 3（深度分析 32 步）、Phase 5（实施 15 skills）。

### full（69 步）

**触发词**："完整工作流" / "full" / "全量"

| Phase | 步骤                           | 验证                          |
| ----- | ------------------------------ | ----------------------------- |
| 1     | 4 个知识图谱工具                | 3 份图谱 + MCP 服务器          |
| 2     | 全部 16 skills                 | 16 个 `docs/phase2-skills/`   |
| 3     | 32 步深度分析                  | CodeGraph/Understand/Graphify |
| 4     | orchestrator 7 轮审计          | 审计报告 + 问题清单            |
| 5     | 全部 15 skills（基于审计发现）  | 修复代码 + 测试通过 + 文档    |

### audit（74 步）

**触发词**："audit" / "审计"

与 full 相同，但：
- Phase 4 扩展到 7 轮完整审计（vs full 的 2 步概要）
- 自动产出 `audit-report-<date>.md`
- Phase 5 覆盖所有审计修复点

## Phase 2 执行方案（v3）

Phase 2 = 纯分析 + 报告产出，**不修改代码**。

```
组 1 — 分析 (7, 按序)
  andrej-karpathy → brainstorming → plan-eng-review
  → plan-design-review → plan-ceo-review
  → design-consultation → office-hours

组 2 — 质量验证 (8, 可并行)
  review → design-review → qa → qa-only
  → systematic-debugging → verification-before-completion
  → debug → gstack-upgrade

组 3 — 回顾 (1)
  retro
```

**详细执行步骤**见 `docs/superpowers/specs/2026-06-08-phase2-skills-execution-design.md`

## Phase 5 执行方案（v3）

Phase 5 = 基于 Phase 4 审计发现实施修复。

```
Phase 5.1 — 规划 (2)
  writing-plans + using-git-worktrees

Phase 5.2 — 修复 (6)
  TDD → executing-plans → verification-before-completion
  → subagent-driven-development → dispatching-parallel-agents
  → finishing-a-development-branch

Phase 5.3 — 文档与发布 (4)
  document-release → writing-skills → ship → browse

Phase 5.4 — 交互收尾 (3)
  requesting-code-review → receiving-code-review
  → setup-browser-cookies
```

**详细执行步骤**见 `docs/superpowers/specs/2026-06-08-phase2-skills-execution-design.md`

## 运行方式

```bash
# 前置检查（必须）
bash scripts/workflow-preflight-check.sh

# 初始化 profile
bash /home/yin/.config/opencode/scripts/workflow-phase.sh --init full

# Phase 门控
bash /home/yin/.config/opencode/scripts/workflow-phase.sh --complete phase1
bash /home/yin/.config/opencode/scripts/workflow-phase.sh --check phase2

# 产物验证
bash scripts/test-baseline.sh --verify
```

## 配置

`server/config/default.json` 中的 `workflow` 节定义了所有 profile 的步骤数和用途。

## Profile 选择规则

| 用户说                     | 选择 profile |
| -------------------------- | ------------ |
| "完整工作流" / "全量"      | full         |
| "Phase 2 全量执行"        | full         |
| "审计修复" / "Phase 5"     | full 或 audit |
| "重大功能前"               | standard     |
| "跑标准"                   | standard     |
| "日常自检" / "commit 前"   | minimal      |
| "审计"                     | audit        |

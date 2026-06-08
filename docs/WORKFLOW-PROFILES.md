# 工作流 Profile 系统

> **目的**：让"完整工作流"从一刀切的 69 步变成按需选择，避免日常开发也跑全量。
> 2026-06-08 更新 (v2)：Phase 2 方案按产出物类型分组 + 审计修复驱动 + 流水线依赖链。

## Profile 一览

| Profile  | Phase 1 | Phase 2          | Phase 3  | Phase 4 | 总步骤 | 实际耗时  | 适用场景                               |
| -------- | ------- | ---------------- | -------- | ------- | ------ | --------- | -------------------------------------- |
| minimal  | ✅ 全   | ✅ 仅组 4 + retro | ❌ skip  | ✅ 1 项 | 13     | 5-10 min  | 日常 commit 前自检                     |
| standard | ✅ 全   | ✅ 组 1+2+4       | ⚠️ 部分  | ✅ 2 项 | 54     | 15-25 min | 重大功能前（推荐默认）                 |
| full     | ✅ 全   | ✅ 全部 5 组      | ✅ 32    | ✅ 2 项 | 69     | 45-60 min | 发版、重大重构                         |
| audit    | ✅ full | ✅ 全部 5 组      | ✅ 32    | ✅ 7轮  | 74     | 60-90 min | 审计场景，自动产出 audit-report        |

> 注：步骤数经 2026-06-08 实际执行验证。minimal/standard 步骤数包含 Skills 子步骤。

## Profile 详细说明

### minimal（13 步）

**触发词**："快速检查" / "commit 前" / "日常自检"

| Phase | 步骤                                                   | 验证              |
| ----- | ------------------------------------------------------ | ----------------- |
| 1     | graphify . + /understand + codegraph + mcp             | 4 个工具存在       |
| 2     | 组 4: document-release + gstack-upgrade + karpathy     | `docs/` 产物      |
| 2     | retro                                                   | 7 天回顾报告      |
| 4     | verify.sh 全量检查                                      | Golden 28 通过    |

**跳过**：组 1(分析)、组 2(验证)、组 3(实施)、组 5(交互)、Phase 3。

### standard（54 步）

**触发词**："跑标准" / "重大功能前" / 默认

| Phase | 步骤                       | 验证                        |
| ----- | -------------------------- | --------------------------- |
| 1     | 4 个知识图谱工具            | 3 份图谱存在                 |
| 2     | 组 1(7) + 组 2(8) + 组 4(6) | 21 个 phase2-skills 报告    |
| 4     | orchestrator-audit + verify | 审计通过 + Golden 28        |

**不包含**：组 3(工程实施)、组 5(交互式)、Phase 3 深度分析。

### full（69 步）

**触发词**："完整工作流" / "full" / "全量"

| Phase | 步骤                                   | 验证                              |
| ----- | -------------------------------------- | --------------------------------- |
| 1     | 4 个知识图谱工具                        | 3 份图谱 + MCP 服务器              |
| 2     | 全部 5 组 31 skills 执行               | 22+ 个 `docs/phase2-skills/` 报告   |
| 2-1   | 7 个分析报告                           | brainstorm/eng-review/design/retro |
| 2-2   | 8 个质量验证                           | review/QA/debug/verification       |
| 2-3   | 8 个工程实施（绑定审计发现）           | 测试 + 修复代码 + worktree        |
| 2-4   | 6 个文档与元                           | doc-release/writing-skills/ship   |
| 2-5   | 2 个交互式（review 回应 + 完成分支）   | review 反馈 + commit/PR            |
| 3     | 32 步深度分析                          | CodeGraph/Understand/Graphify 全  |
| 4     | orchestrator 7 轮审计                  | 审计报告 + 问题清单               |

### audit（74 步）

**触发词**："audit" / "审计"

与 full 相同，但：
- Phase 4 扩展到 7 轮完整审计（vs full 的 2 步概要）
- 自动产出 `audit-report-<date>.md`
- Phase 2-2 增加 systematic-debugging 深入排查已知问题
- Phase 2-3 工程实施覆盖所有审计修复点

## Phase 2 执行方案（v2，2026-06-08 修订）

Phase 2 不再只是"加载 31 个 skills"，而是**按产出物类型分组执行**并驱动审计修复：

| 组 | 名称 | 数量 | 执行方式 | 典型产出 |
|----|------|------|----------|----------|
| 1 | 分析报告 | 7 | 对项目自动分析 | 脑暴 spec / 架构审查 / 设计建议 |
| 2 | 质量验证 | 8 | 需要 bash/browser | 代码审查 / QA 报告 / bug 报告 |
| 3 | 工程实施 | 8 | 绑定审计发现执行 | 测试 / 修复代码 / 新 skill |
| 4 | 文档与元 | 6 | 自动写入 | 文档更新 / env 报告 / 编码原则 |
| 5 | 交互式 | 2 | 需要用户参与 | review 回应 / 完成分支 |

**核心变更（v1 → v2）：**
- 分组逻辑：执行方式(E/A/B/C/D) → 产出物类型(分析/验证/实施/文档)
- 组 3 (工程实施) 直接绑定审计发现的优化点，不空转
- 流水线依赖链：Step 1(分析) → 2(验证) → 3(实施) → 4(文档) → 5(交互)
- 产出物位置：`.gstack/` → `docs/phase2-skills/`

**详细执行步骤**见 `docs/superpowers/specs/2026-06-08-phase2-skills-execution-design.md`

**实际执行报告**见 `docs/superpowers/reports/phase2-skills-execution-report.md`

## 运行方式

```bash
# 前置检查（必须）
bash scripts/workflow-preflight-check.sh

# 初始化 profile
bash /home/yin/.config/opencode/scripts/workflow-phase.sh --init full

# Phase 门控（自动验证依赖）
bash /home/yin/.config/opencode/scripts/workflow-phase.sh --complete phase1
bash /home/yin/.config/opencode/scripts/workflow-phase.sh --check phase2

# 产物验证
bash scripts/test-baseline.sh --verify
bash scripts/verify-skills-execution.sh
```

## 配置

`server/config/default.json` 中的 `workflow` 节定义了 4 个 profile 的步骤数和用途。

## Profile 选择规则

| 用户说                      | 选择 profile |
| --------------------------- | ------------ |
| "完整工作流"                | full         |
| "跑全量"                    | full         |
| "Phase 2 全量执行"         | full         |
| "Skills 全执行"            | full 或 audit |
| "重大功能前"                | standard     |
| "跑标准"                    | standard     |
| "审计修复" / "Phase 2 组 3" | full 或 audit |
| "日常自检"                  | minimal      |
| "commit 前"                 | minimal      |
| "审计"                      | audit        |
| "audit"                     | audit        |

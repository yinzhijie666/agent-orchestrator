# 工作流 Profile 系统

> **目的**：让"完整工作流"从一刀切的 69 步变成按需选择，避免日常开发也跑全量。

## Profile 一览

| Profile  | Phase 1 | Phase 2 | Phase 3  | Phase 4 | 总步骤 | 耗时(估) | 适用场景                               |
| -------- | ------- | ------- | -------- | ------- | ------ | -------- | -------------------------------------- |
| minimal  | ✅ 全   | ❌ skip | ❌ skip  | ✅ 1 项 | 5      | 30s      | 日常 commit 前自检                     |
| standard | ✅ 全   | ✅ 31   | ⚠️ 16/32 | ✅ 2 项 | 37     | 3-5 min  | 重大功能前（推荐默认）                 |
| full     | ✅ 全   | ✅ 31   | ✅ 32    | ✅ 2 项 | 69     | 10-20min | 发版、重大重构                         |
| audit    | ✅ full | ✅ 31   | ✅ 32    | ✅ 2 项 | 69     | 15-30min | 审计场景，自动产出 audit-report        |

## Profile 详细说明

### minimal（5 步）

**触发词**："快速检查" / "commit 前" / "日常自检"

| Phase | 步骤                                                                 | 验证           |
| ----- | -------------------------------------------------------------------- | -------------- |
| 1     | graphify . + /understand + codegraph init -i + /graphify . --mcp      | 4 个工具存在    |
| 4     | verify.sh 全量检查                                                   | Golden 28 通过 |

**不包含**：31 skills 加载、深度分析、P0 技能验证。

### standard（37 步）

**触发词**："跑标准" / "重大功能前" / 默认

| Phase | 步骤                                       | 验证                   |
| ----- | ------------------------------------------ | ---------------------- |
| 1     | graphify . + /understand + codegraph + mcp | 4 个工具存在            |
| 2     | 31 skills 全部加载                         | Karpathy 1 + SP 14 + GS 16 |
| 4     | orchestrator-audit + verify.sh             | 审计通过 + Golden 28   |

**不包含**：Phase 3 深度分析（32 步）。

### full（69 步）

**触发词**："完整工作流" / "full" / "全量"

包含全部 4 个 Phase，所有 69 个步骤。详见 CLAUDE.md "完整工作流执行合约"。

### audit（69 步 + audit-report）

**触发词**："audit" / "审计"

与 full 相同，但额外自动产出 `audit-report-<date>.md`。

## 运行方式

```bash
# 只读演练（推荐先跑）
WORKFLOW_PROFILE=full bash scripts/workflow-dry-run.sh

# 前置检查
bash scripts/workflow-preflight-check.sh

# 产物验证
bash scripts/verify-skills-execution.sh

# Skills 健康检查
bash scripts/skills-inventory.sh

# 能力矩阵生成
bash scripts/codegraph-capability-matrix.sh
```

## 配置

`opencode.jsonc` 中的 `workflow` 节定义了 4 个 profile 的步骤数和用途。修改此文件可自定义 profile。

## Profile 选择规则

| 用户说         | 选择 profile |
| -------------- | ------------ |
| "完整工作流"   | full         |
| "跑全量"       | full         |
| "重大功能前"   | standard     |
| "跑标准"       | standard     |
| "日常自检"     | minimal      |
| "commit 前"    | minimal      |
| "审计"         | audit        |
| "audit"        | audit        |

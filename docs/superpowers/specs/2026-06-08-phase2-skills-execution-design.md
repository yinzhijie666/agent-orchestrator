# Phase 2 Skills 真实执行设计方案（v2）

> 修订日期: 2026-06-08
> 版本: v2
> 基于 v1 实际执行经验优化，核心变更：按产出物类型分组 + 审计修复驱动 + 流水线式依赖链。

## 设计原则

1. **按产出物类型分组** — 同类 skill 集中执行，减少上下文切换
2. **流水线依赖链** — 前一步的产出驱动后一步的执行
3. **审计修复驱动** — 组 3 (工程实施) 直接绑定审计发现的优化点，不空转
4. **交互式收尾** — 需要用户参与的 skill 统一放在最后，不打断自动流程

## 分组策略

| 组   | 名称       | 数量 | 执行方式         | 典型产出                        |
| ---- | ---------- | ---- | ---------------- | ------------------------------- |
| 组 1 | 分析报告   | 7    | 对项目自动分析   | 脑暴 spec / 架构审查 / 设计建议 |
| 组 2 | 质量验证   | 8    | 需要 bash/browser | 代码审查 / QA 报告 / bug 报告   |
| 组 3 | 工程实施   | 8    | 绑定审计发现执行 | 测试 / 修复代码 / 新 skill      |
| 组 4 | 文档与元   | 6    | 自动写入         | 文档更新 / env 报告 / 编码原则  |
| 组 5 | 交互式     | 2    | 需要用户参与     | review 回应 / 完成分支           |

## 执行流水线

```
组 1（分析报告） ──→ 组 2（质量验证） ──→ 组 3（工程实施） ──→ 组 4（文档与元） ──→ 组 5（交互式）
       │                    │                    │                     │
       └──── 产出物 ────────┴──── 驱动 ──────────┴──── 记录 ───────────┴──── 收尾
```

### Step 1: 分析报告（7 skills）

对 agent-orchestrator 项目做全面分析，产出 7 份报告到 `docs/phase2-skills/`。

| Skill                  | 执行内容                                 | 产出文件                          |
| ---------------------- | ---------------------------------------- | --------------------------------- |
| `brainstorming`        | 项目全面脑暴，产出改进方向 spec          | `01-brainstorming.md`             |
| `plan-eng-review`      | 审查三层架构(plugin/server/db)           | `02-plan-eng-review.md`           |
| `plan-design-review`   | 审查设计模式(events/checkpoint/dispatch) | `03-plan-design-review.md`        |
| `plan-ceo-review`      | 项目方向与战略评估                       | `04-plan-ceo-review.md`           |
| `design-consultation`  | 设计建议(API/WS/dashboard)               | `05-design-consultation.md`       |
| `office-hours`         | YC 式项目方向问诊                        | `06-office-hours.md`              |
| `retro`                | git 历史回顾报告                         | `07-retro.md`                     |

### Step 2: 质量验证（8 skills）

对项目做实际代码/功能验证，发现问题并记录。

| Skill                       | 执行内容                           | 产出文件                       |
| --------------------------- | ---------------------------------- | ------------------------------ |
| `review`                    | 代码审查，找具体代码问题           | `08-review.md`                 |
| `design-review`             | 审查 dashboard UI                  | `09-design-review.md`          |
| `qa`                        | 全功能 QA                         | `10-qa.md`                     |
| `qa-only`                   | 仅 QA 不改代码                     | `11-qa-only.md`                |
| `systematic-debugging`      | 系统性扫描代码问题                 | `12-systematic-debugging.md`   |
| `verification-before-completion` | 项目当前健康度验证            | `13-verification.md`           |
| `debug`                     | 对发现的 bug 做深度分析            | `14-debug.md`                  |
| `gstack-upgrade`            | 环境健康检查                       | `15-gstack-upgrade.md`         |

### Step 3: 工程实施（8 skills）

目标：针对 Step 1-2 发现 + 审计发现的优化点，实施修复。

**审计发现绑定目标：**

| 审计优化点                    | 实施方式                        | 验证                          |
| ----------------------------- | ------------------------------- | ----------------------------- |
| Phase 2 报告噪音              | TDD: auto-detect 测试           | `bun test` 全通过             |
| `_isServerPreferred` 配置歧义 | 重构配置检测逻辑                | 测试覆盖                      |
| CAPABILITY_LIST 统一性        | 提取共享常量                    | 断言验证                      |
| 测试覆盖率缺口                | 补充缺失测试                    | `bun test --coverage`         |

**Skill 执行表：**

| Skill                            | 执行内容                      | 产出文件/产物                 |
| -------------------------------- | ----------------------------- | ----------------------------- |
| `writing-plans`                  | 基于审计发现制定修复计划       | `16-writing-plans.md`         |
| `test-driven-development`        | RED: 为每个修复写测试          | 新增测试文件                  |
| `executing-plans`                | GREEN: 实施修复代码            | 修复代码                      |
| `verification-before-completion` | 验证修复通过                   | `17-verification.md`          |
| `subagent-driven-development`    | 并行修复独立模块               | 各 agent 独立产出             |
| `dispatching-parallel-agents`    | 调度并发任务                   | agent 并行结果                |
| `using-git-worktrees`            | 隔离工作区                     | worktree 创建                 |
| `finishing-a-development-branch` | 完成分支(4选项)                | commit / PR / 保留 / 放弃     |

### Step 4: 文档与元（6 skills）

收尾文档与元技能执行。

| Skill                  | 执行内容             | 产出文件                     |
| ---------------------- | -------------------- | ---------------------------- |
| `document-release`     | 更新 README 等文档   | `18-document-release.md`     |
| `writing-skills`       | 为项目建立复用 skill | 新 SKILL.md                  |
| `ship`                 | 发布准备检查         | `19-ship.md`                 |
| `browse`               | browser 截图验证     | `20-browse.md` + 截图        |
| `setup-browser-cookies` | browser session      | `21-browser-cookies.md`      |
| `andrej-karpathy`      | 编码原则评估报告     | `22-karpathy-principles.md`  |

### Step 5: 交互式（2 skills，需要你参与）

| Skill                     | 执行内容                         |
| ------------------------- | -------------------------------- |
| `requesting-code-review`  | 请求审查最终代码                 |
| `receiving-code-review`   | 响应审查意见                     |

## 与 v1 的核心区别

| 维度       | v1                           | v2 (当前)                              |
| ---------- | ---------------------------- | -------------------------------------- |
| 分组逻辑   | 按执行方式(E/A/B/C/D)        | 按**产出物类型**(分析/验证/实施/文档)    |
| 组 3 目标  | 无具体目标                   | 直接绑定**审计发现的优化点**             |
| 阶段关系   | 5 个独立类别                 | 流水线式依赖链(Step 1→2→3→4→5)          |
| 产出复用   | 各 skill 独立                | Step 1-2 报告驱动 Step 3 修复           |
| 审计关联   | 无                           | 显式绑定，每个优化点可追溯               |
| 评估耗时   | ~55 min                      | ~90 min (含真实修复)                    |
| 产出物位置 | `.gstack/`                   | `docs/phase2-skills/` (统一目录)         |

## 执行前置条件

```bash
# 1. 知识图谱就绪
ls graphify-out/graph.json
ls .understand-anything/knowledge-graph.json
codegraph status

# 2. 测试基线
bash scripts/test-baseline.sh --save

# 3. 服务器启动（供 browser/QA）
bun run dev &
```

## 执行后验证

```bash
# 全量测试
bun test

# 验证产出物完整性
ls docs/phase2-skills/*.md | wc -l
# 预期: ~22 个文件

# 产物内容检查
grep -l "✅\|❌\|⚠️" docs/phase2-skills/*.md | wc -l
```

## Profile 适配

| Profile  | Phase 2 执行范围       | 跳过         | 耗时     |
| -------- | ---------------------- | ------------ | -------- |
| minimal  | 组 4 + 组 1(retro)     | 组 2/3/5     | 10 min   |
| standard | 组 1 + 组 2 + 组 4     | 组 3/5       | 25 min   |
| full     | 全部 5 组              | 无           | 90 min   |
| audit    | 全部 5 组 + 深度审计   | 无           | 120 min  |

## 错误处理

| 失败模式           | 处理策略                       |
| ------------------ | ------------------------------ |
| skill 加载失败     | 记录错误，继续下一个           |
| 测试失败           | 记录失败详情，不阻塞后续 skill |
| browser 不可用     | 跳过 browser 相关 skill，标注  |
| 服务器未启动       | 跳过 QA/design-review，标注     |
| 审计发现无代码修复 | writing-plans 产出设计文档     |

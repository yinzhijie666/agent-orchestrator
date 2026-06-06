# 检查点机制（Checkpoint System）

## 概述

完整工作流中，所有需要用户输入的步骤都会触发检查点，工作流暂停等待用户操作后继续。

## 核心规则

1. **17 个检查点全部暂停**（7 INTERACTIVE + 10 TOOL_REQUIRED）
2. **无限等待**——不允许超时、不允许跳过
3. **用户确认产物内容**——检查点显示产物摘要（30 行），用户确认后继续
4. **产物必须是当次生成**——通过文件 mtime 与工作流启动时间比较，旧产物不接受

## 检查点类型

### 命令检查点（1 个）

| 检查点      | 验证文件                                  | 修复提示                            |
| ----------- | ----------------------------------------- | ----------------------------------- |
| /understand | `.understand-anything/knowledge-graph.json` | 在 OpenCode 对话中输入: /understand |

**行为**：工作流终止 (exit 1)，提示用户执行命令后重跑。

### 交互技能检查点（7 个）

| 技能                           | 产物验证                      | 用户确认内容      |
| ------------------------------ | ----------------------------- | ----------------- |
| brainstorming                  | `docs/superpowers/specs/*.md`   | spec doc 内容摘要 |
| executing-plans                | plan 执行日志                 | 执行结果          |
| subagent-driven-development    | 子 agent 执行日志             | 执行结果          |
| receiving-code-review          | review 反馈处理日志           | 修复内容          |
| finishing-a-development-branch | 用户选择记录                  | 用户选择的选项    |
| using-git-worktrees            | worktree 路径                 | worktree 位置     |
| design-consultation            | `.gstack/design-reports/*.md`   | 设计报告内容摘要  |

**行为**：工作流暂停，提示用户在 OpenCode 对话中执行 `skill <name>`，用户按 Enter 后继续。

### 工具技能检查点（10 个）

| 技能                           | 所需工具    | 产物验证                              | 用户确认内容      |
| ------------------------------ | ----------- | ------------------------------------- | ----------------- |
| test-driven-development        | bash + 测试 | 测试 commit + 测试结果                | RED/GREEN 结果    |
| systematic-debugging           | bash        | `.gstack/debug-reports/*.md`            | debug report 内容 |
| verification-before-completion | bash + 测试 | 测试结果                              | 5 步 Gate 结果    |
| browse                         | Playwright  | 截图路径                              | 截图内容          |
| debug                          | bash        | `.gstack/debug-reports/*.md`            | debug report 内容 |
| design-review                  | Playwright  | `.gstack/design-reports/screenshots/`   | 截图 + 3 findings |
| qa                             | Playwright  | `.gstack/qa-reports/*.md`               | QA 报告内容       |
| qa-only                        | Playwright  | `.gstack/qa-reports/*.md`               | QA 报告内容       |
| setup-browser-cookies          | Playwright  | `.gstack/browser-session/*.md`          | 浏览器会话状态    |
| ship                           | bash + 测试 | `.gstack/ship-reports/*.md`             | 发版准备报告内容  |

**行为**：工作流暂停，提示用户提供工具或执行技能，用户按 Enter 后继续。

## 新鲜度验证

产物必须是当次工作流执行期间生成的，通过文件 mtime 验证：

```
工作流启动时间: WORKFLOW_START=$(date +%s)
产物文件时间: file_mtime=$(stat -c %Y "$file")

if file_mtime < WORKFLOW_START:
    产物太旧，不接受
    提示用户重新执行技能
```

## 执行流程

```
Phase 1: 知识图谱构建
  [1/4] graphify . — 自动执行 ✅
  [2/4] /understand — 命令检查点
         ├── 不存在 → 工作流终止 (exit 1)
         └── 存在 → 继续
  [3/4] codegraph init -i — 自动执行 ✅
  [4/4] /graphify . --mcp — 不可用（已用 CLI 替代）

Phase 2: 技能加载（自动）

Phase 2.5: Skill 分类

Phase 3: 深度分析
  Understand skills (5 个) — 自动执行 ✅
  CodeGraph tools (9 个) — 自动执行 ✅
  Graphify tools (7 个) — 自动执行 ✅
  交互技能检查点 (7 个) — 逐个暂停等待用户
  工具技能检查点 (10 个) — 逐个暂停等待用户

Phase 4: 审计验证
```

## 产物摘要格式

每个检查点显示产物前 30 行内容：

```
=== 检查点 1: brainstorming (INTERACTIVE) ===
  需要用户 1-by-1 Q&A，输出 spec doc

  ✅ 产物已存在且新鲜: docs/superpowers/specs/2026-06-05-xxx-design.md
  --- 产物摘要 (前 30 行) ---
  # XXX Design Spec
  ## Overview
  ...
  ---

  产物内容是否正确？按 Enter 继续...
```

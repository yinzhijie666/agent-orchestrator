# Skill Writing Guide — Agent Orchestrator

**生成时间**: 2026-06-08
**Skill**: writing-skills

---

## Skill 目录结构

```
skills/<skill-name>/
├── SKILL.md          # 主文件（必需）
├── scripts/           # shell 辅助脚本（可选）
├── reference/         # 参考文档（可选）
└── assets/            # 图片/模板（可选）
```

## SKILL.md 模板

```markdown
# Skill: <skill-name>

<!-- 一句话描述该技能的用途 -->

## 适用场景

- 场景 A：...
- 场景 B：...

## 执行步骤

1. **步骤 1** — 描述
2. **步骤 2** — 描述

## 验证标准

- 产物路径：`<path>`
- 检查项：<check>

## 输入/输出

- 输入：<expected input>
- 输出：<expected artifact>

Base directory for this skill: file:///path/to/skill
```

## 本项目的 Skill 分类

| 类别 | Skill 数 | 示例 |
|------|----------|------|
| INTERACTIVE | 7 | brainstorming, executing-plans |
| TOOL_REQUIRED | 10 | test-driven-development, browse |
| AUTO | 14 | andrej-karpathy, writing-plans |

## 产物约定

| 类别 | 产物目录 |
|------|----------|
| Spec/Plan | `docs/superpowers/` |
| 报告 | `.gstack/*/` |

## 注意事项

- P0 技能必须有产物验证
- SKILL.md 使用 `file://` base directory 引用本地资源
- 技能间可组合：brainstorming → writing-plans → TDD

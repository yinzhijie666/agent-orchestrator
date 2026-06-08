# Git Worktree Setup

**生成时间**: 2026-06-08
**Skill**: using-git-worktrees

---

## 状态

当前不使用 git worktree。`--worktrees/` 目录已在 `.gitignore` 中配置。

## 如果需要使用

```bash
git worktree add ../agent-orchestrator-feature feature-branch
```

## 清理

```bash
git worktree prune
```

## 注意

- Worktree 的 `.understand-anything/` 和 `tests/*.sqlite` 不会互相干扰（路径独立）
- `graphify-out/` 在 `.gitignore` 中

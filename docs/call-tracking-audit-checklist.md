# Call-Tracking Audit Checklist

## 目的

系统化审计"调用可观测性缺口"：找出所有未被日志/监控覆盖的 API 调用路径。

适用于：增加新功能后、重构前、排查"某个模块不知道跑了多少次"的问题时。

---

## 4 步审计流程

### Step 1：列出所有"调用点"

找出所有对外/对内 API 调用入口：

```bash
# 模型调用
rg -n "\.chat\(|\.chatWithFallback\(|\.executeTask\(|\.searchCode\(" --include="*.js" src/

# HTTP 调用
rg -n "fetch\(|axios\.get\(|axios\.post\(" --include="*.js" src/

# 子进程
rg -n "spawn\(|exec\(|execSync\(" --include="*.js" src/

# 事件发射
rg -n "\.emit\(|broadcaster\.broadcast\("
```

输出格式：

```
src/client.js:42   chat()         → 模型主调用
src/worker.js:88   fetch()         → 外部 API
```

### Step 2：列出所有"日志点"

找出日志/监控/审计入口：

```bash
# 数据库日志
rg -n "logActivity\(|\.log\(" --include="*.js" src/

# 事件总线
rg -n "eventBus\.emit\(|events\.emit\(" --include="*.js" src/

# 监控指标
rg -n "metrics\.|\.inc\(|\.gauge\(" --include="*.js" src/

# 控制台告警
rg -n "console\.warn\(|console\.error\(" --include="*.js" src/
```

输出格式：

```
src/db.js:152     logActivity()     → 动作审计日志
src/monitor.js:20  metrics.inc()      → 计数器
```

### Step 3：交叉核对

对每个调用点，检查其附近（50 行范围内）是否存在对应的日志点：

| 状态           | 含义                   | 优先级 |
| -------------- | ---------------------- | ------ |
| **完全缺失**   | 近 50 行无任何日志      | P0     |
| **部分缺失**   | 有成功日志，无失败日志  | P0     |
| **无守卫**     | 有日志但无 `if (db)` 保护 | P1     |
| **完整**       | 成功/失败/降级都有记录  | ✅     |

核查模板（每行对应一个调用点）：

```
| src/client.js:42 | chat() | ✅ | plan_analysis 日志存在 |
| src/client.js:88 | fetch() | ❌ P0 | 完全无日志             |
| src/worker.js:12 | chatWithFallback() | ⚠️ P1 | 有成功日志但 fallback 不记录 |
```

### Step 4：输出差距报告

按优先级排序：

```markdown
## 审计报告

### P0 (必须修复)
- src/client.js:88 fetch() — 完全无日志，无法知道调用次数和失败率
- src/worker.js:55 chat() — 仅成功时记录，失败时静默

### P1 (推荐修复)
- src/client.js:12 executeTask() — 有 logActivity 但无 if(db) 守卫
- src/server.js:34 reviewCheckpoint() — silent fallback 无日志

### P2 (可选修复)
- src/metrics.js:9 emit() — 已记录到三次，但缺耗时字段
```

---

## 常见缺口类型

| 缺口类型             | 典型表现                                              | 修复模式                        |
| -------------------- | ----------------------------------------------------- | ------------------------------- |
| **完全无日志**       | 调用点周围 50 行没有任何 log/emit/console              | 加 `logActivity` 或 `eventBus.emit` |
| **仅成功有日志**     | try 块内有 log，catch 块内没有                        | catch 块补 `eventBus.emit`      |
| **无声降级**         | fallback 成功但调用方不检查返回值中的 `_fallback` 标记 | 加 `onFallback` callback        |
| **无守卫**           | 日志假设 DB/文件系统可用，没有 `if (db)` 保护            | 加 guard clause                 |
| **日志粒度过粗**     | 整个方法一个日志，不知道具体哪一步失败                    | 关键分支加独立 event             |

---

## 一键审计脚本模板

```bash
#!/bin/bash
# audit-call-tracking.sh
# 用法: bash audit-call-tracking.sh [src-dir]

SRC="${1:-src}"

echo "=== 调用点 ==="
rg -n "\.chat\(|\.chatWithFallback\(|\.executeTask\(|fetch\(" --include="*.js" -c "$SRC"

echo ""
echo "=== 日志点 ==="
rg -n "logActivity\(|eventBus\.emit\(|metrics\.|console\.(warn|error)" --include="*.js" -c "$SRC"

echo ""
echo "=== 无 if(db) 保护的日志 ==="
rg -n "logActivity\(" --include="*.js" "$SRC" | rg -v "if \(db\)" | rg -v "//.*skip"

echo ""
echo "=== catch 块中无日志的调用 ==="
rg -n "catch\s*\(.*\)\s*\{" --include="*.js" -A3 "$SRC" | rg -B1 -A3 "catch" | rg -v "logActivity|emit|console"
```

---

## 已应用此检查表的项目

- agent-orchestrator (2026-06-11): 发现 8 个 P0 缺口，修复后新增 9 种 activity_log 事件

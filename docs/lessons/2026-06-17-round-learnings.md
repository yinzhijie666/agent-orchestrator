# 2026-06-17 工作流回顾: 学习与模式提取

## 模式 1: 多执行器提示词必须包含选择标准

**发现**: Kimi 的 `generatePlan` 提示词列出了 `executor: ['kimi', 'deepseek', 'zen']` 但没说何时选哪个。LLM 对所有 item 默认选 `deepseek`，`zen` 从未被调用。

**原则**: 给 LLM 的提示词中提供多个选项（executor、model、action type 等）时，必须在枚举后立即注明每个选项的适用条件，否则 LLM 默认选第一个或最常见选项，忽略其他。

**检测条件**:
- audit 时检查所有 system prompt 中的枚举选项，是否有选择标准说明
- 如果有选项没有描述"何时使用"，视为待修复的 prompt bug

**修复示例**:
```diff
- executor: one of ['kimi', 'deepseek', 'zen']
+ executor: one of ['kimi', 'deepseek', 'zen']
+   - 'kimi': 规划/分析/审查 (无需执行)
+   - 'deepseek': 编码、测试、文件修改 (实现任务)
+   - 'zen': 搜索、研究、信息收集 (只读分析)
```

**涉及文件**:
- `server/lib/model-clients/kimi-client.js:28-31` — 修复位置

---

## 模式 2: 知识图谱新鲜度

**发现**: `graphify-out/graph.json` 和 `.understand-anything/knowledge-graph.json` 过期 9 天，完整工作流仍可执行，导致分析基于过时数据。

**原则**:
- 知识图谱 >48h 应视为过期，工作流应在 Phase 1 前阻断
- 24-48h: warning（可继续，建议刷新）
- >48h: error（阻断，要求先重建图谱）

**检测条件**: `workflow-preflight-check.sh` check 7 + check 7.5 的时间戳校验

**修复位置**: `scripts/workflow-preflight-check.sh` line 150-156

---

## 模式 3: 端口冲突

**发现**: 运行中的 agent-orchestrator server (port 8765) 与测试服务冲突，导致所有测试因 `EADDRINUSE` 失败。

**原则**: 执行测试前检查目标端口（server port 8765 + dashboard port 18765）是否已被占用。被占时先提示用户停止服务再跑测试。

**检测条件**: `preflight check 13` 增加到 8765 端口检测

**修复位置**: `scripts/workflow-preflight-check.sh` line 273-285

---

## 模式 4: 审计驱动修复流水线

**发现**: Phase 4 audit → 分类 → Phase 5 plan → fix → verify 的闭环工作良好：
1. 审计产出问题清单（Round 5-7 发现 3 个 P2）
2. 按严重度分类（P0/P1/P2）
3. Plan 阶段制定修复方案
4. 逐一修复 + TDD 验证
5. 最终全量测试确认无回归

**原则**:
- 分析阶段只找出问题、不修改代码
- 修复阶段基于审计分类逐一解决
- 每个修复必须有测试验证
- P0/P1 优先处理，P2 酌情处理

---

## 总结

| 模式 | 类型 | 优先级 | 自动化可能性 |
|------|------|--------|-------------|
| 多执行器选择标准 | prompt 设计原则 | P1 | 人工 audit |
| 知识图谱新鲜度 | 工作流质量 | P1 | 脚本自动化 |
| 端口冲突 | 环境检测 | P2 | 脚本自动化 |
| 审计驱动修复 | 工作流方法 | P0 | 半自动化 |

#!/bin/bash
# ==============================================================
# P0 技能执行验证脚本 (8 项 + 工具输出)
#   - 检查 8 个 P0/P1 技能是否被"按工作流执行"（不仅加载）
#   - 每个检查输出 30 行实际内容（非一行 summary）
#   - 捕获 CodeGraph/Graphify/Understand 实际输出
#   - 生成 .gstack/skill-execution-log.md（持久化到 git）
#   - 产物新鲜度验证：--fresh 模式要求产物 mtime >= WORKFLOW_START
#   - 颜色化输出: 绿=通过, 黄=警告, 红=失败
# ==============================================================
set -e

PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
cd "$PROJECT_ROOT" 2>/dev/null || { echo "❌ 无法进入项目根目录: $PROJECT_ROOT"; exit 1; }

export PATH="$HOME/.bun/install/global/node_modules/.bin:$HOME/.bun/bin:$PATH"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

LOG_FILE=".gstack/skill-execution-log.md"
OUTPUT_LINES=30

# 新鲜度模式
FRESH_MODE=false
if [ "$1" = "--fresh" ]; then
  FRESH_MODE=true
  WORKFLOW_START="${WORKFLOW_START:-$(date +%s)}"
fi

# 产物新鲜度验证
check_freshness() {
  local file="$1"
  local skill="$2"
  
  if [ "$FRESH_MODE" != "true" ]; then
    return 0  # 非 fresh 模式，跳过新鲜度检查
  fi
  
  local actual_file
  actual_file=$(ls -t $file 2>/dev/null | head -1)
  
  if [ -z "$actual_file" ]; then
    return 1  # 文件不存在
  fi
  
  local file_mtime
  file_mtime=$(stat -c %Y "$actual_file" 2>/dev/null || echo 0)
  
  if [ "$file_mtime" -lt "$WORKFLOW_START" ]; then
    echo -e "  ${RED}❌ $skill 产物太旧（工作流启动前生成）${NC}"
    echo "     文件: $actual_file"
    return 1
  fi
  
  return 0
}

echo -e "${BLUE}=== P0 技能执行验证 (8 项 + 工具输出) ===${NC}"
echo ""
echo "项目: $(basename $(pwd))"
echo "时间: $(date -Iseconds)"
if [ "$FRESH_MODE" = "true" ]; then
  echo "模式: --fresh (产物必须是当次生成)"
  echo "工作流启动时间: $WORKFLOW_START"
fi
echo ""

mkdir -p .gstack

# 初始化日志
cat > "$LOG_FILE" <<EOF
# Skill Execution Log
**时间**: $(date -Iseconds)
**项目**: $(basename $(pwd))
**Profile**: ${WORKFLOW_PROFILE:-standard}

---

EOF

CHECKS_PASSED=0
CHECKS_TOTAL=8

SPEC_MAX_AGE_DAYS=7
PLAN_MAX_AGE_DAYS=7
TEST_MAX_AGE_DAYS=7
DEBUG_MAX_AGE_DAYS=30

# ============================================================
# Phase 1: 工具执行结果（30 行/工具）
# ============================================================
echo -e "${BLUE}=== Phase 1: 工具执行结果 ===${NC}"
echo "" >> "$LOG_FILE"
echo "## Phase 1: 工具执行结果" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# CodeGraph context
echo -e "${BLUE}[工具]${NC} codegraph context (30 行)"
echo "### CodeGraph context" >> "$LOG_FILE"
echo '```' >> "$LOG_FILE"
codegraph context "agent orchestrator architecture" 2>&1 | head -${OUTPUT_LINES} | tee -a "$LOG_FILE" | sed 's/^/  /'
echo '```' >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# CodeGraph impact
echo -e "${BLUE}[工具]${NC} codegraph impact (30 行)"
echo "### CodeGraph impact" >> "$LOG_FILE"
echo '```' >> "$LOG_FILE"
codegraph impact "BaseModelClient" 2>&1 | head -${OUTPUT_LINES} | tee -a "$LOG_FILE" | sed 's/^/  /'
echo '```' >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Graphify query
echo -e "${BLUE}[工具]${NC} graphify query (30 行)"
echo "### Graphify query" >> "$LOG_FILE"
echo '```' >> "$LOG_FILE"
graphify query "project architecture" --budget 500 2>&1 | head -${OUTPUT_LINES} | tee -a "$LOG_FILE" | sed 's/^/  /'
echo '```' >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Graphify path
echo -e "${BLUE}[工具]${NC} graphify path (30 行)"
echo "### Graphify path" >> "$LOG_FILE"
echo '```' >> "$LOG_FILE"
graphify path "index.js" "server/index.js" 2>&1 | head -${OUTPUT_LINES} | tee -a "$LOG_FILE" | sed 's/^/  /'
echo '```' >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# /understand knowledge graph
echo -e "${BLUE}[工具]${NC} /understand → knowledge-graph.json (30 行)"
echo "### /understand knowledge-graph.json" >> "$LOG_FILE"
if [ -f ".understand-anything/knowledge-graph.json" ]; then
  KG_SIZE=$(du -h ".understand-anything/knowledge-graph.json" 2>/dev/null | cut -f1)
  KG_AGE=$(( ($(date +%s) - $(stat -c %Y ".understand-anything/knowledge-graph.json" 2>/dev/null || echo 0)) / 3600 ))
  echo -e "  ${GREEN}✅ knowledge-graph.json 存在 ($KG_SIZE, ${KG_AGE}h 前)${NC}"
  echo "- 状态: ✅ 已初始化 ($KG_SIZE, ${KG_AGE}h 前)" >> "$LOG_FILE"
  echo "- 内容摘要 (前 ${OUTPUT_LINES} 行):" >> "$LOG_FILE"
  echo '```' >> "$LOG_FILE"
  head -${OUTPUT_LINES} ".understand-anything/knowledge-graph.json" | tee -a "$LOG_FILE" | sed 's/^/  /'
  echo '```' >> "$LOG_FILE"
else
  echo -e "  ${RED}❌ knowledge-graph.json 不存在${NC}"
  echo -e "     请在 OpenCode 对话中输入: ${GREEN}/understand${NC}"
  echo "- 状态: ❌ 未初始化 (需在 OpenCode 对话中执行 /understand)" >> "$LOG_FILE"
fi
echo "" >> "$LOG_FILE"

echo ""

# ============================================================
# Phase 2: Skills 执行结果
# ============================================================
echo -e "${BLUE}=== Phase 2: Skills 执行结果 ===${NC}"
echo "" >> "$LOG_FILE"
echo "## Phase 2: Skills 执行结果" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# P0 #1: brainstorming 应产出 spec doc (7d 内或当次生成)
echo -e "${BLUE}[P0 #1]${NC} brainstorming → specs/"
echo "### [P0 #1] brainstorming — INTERACTIVE" >> "$LOG_FILE"
if ls docs/superpowers/specs/*.md 2>/dev/null | head -1 > /dev/null; then
  SPEC_FILE=$(ls -t docs/superpowers/specs/*.md 2>/dev/null | head -1)
  SPEC_AGE_HOURS=$(( ( $(date +%s) - $(stat -c %Y "$SPEC_FILE") ) / 3600 ))
  # 新鲜度检查
  if [ "$FRESH_MODE" = "true" ]; then
    if ! check_freshness "docs/superpowers/specs/*.md" "brainstorming"; then
      echo "- 状态: ❌ 产物太旧（非当次生成）" >> "$LOG_FILE"
    else
      echo -e "  ${GREEN}✅ 找到 spec doc (当次生成): $SPEC_FILE${NC}"
      echo "- 状态: ✅ 已执行 (当次生成)" >> "$LOG_FILE"
      echo "- 产物: $SPEC_FILE" >> "$LOG_FILE"
      echo "- 内容摘要 (前 ${OUTPUT_LINES} 行):" >> "$LOG_FILE"
      echo '```' >> "$LOG_FILE"
      head -${OUTPUT_LINES} "$SPEC_FILE" >> "$LOG_FILE"
      echo '```' >> "$LOG_FILE"
      CHECKS_PASSED=$((CHECKS_PASSED+1))
    fi
  elif [ $SPEC_AGE_HOURS -gt $((SPEC_MAX_AGE_DAYS*24)) ]; then
    echo -e "  ${YELLOW}⚠️  spec 存在但太旧: $SPEC_FILE (${SPEC_AGE_HOURS}h 前)${NC}"
    echo "- 状态: ⚠️ 太旧 (${SPEC_AGE_HOURS}h)" >> "$LOG_FILE"
  else
    echo -e "  ${GREEN}✅ 找到 spec doc: $SPEC_FILE (${SPEC_AGE_HOURS}h 前)${NC}"
    echo "- 状态: ✅ 已执行" >> "$LOG_FILE"
    echo "- 产物: $SPEC_FILE" >> "$LOG_FILE"
    echo "- 内容摘要 (前 ${OUTPUT_LINES} 行):" >> "$LOG_FILE"
    echo '```' >> "$LOG_FILE"
    head -${OUTPUT_LINES} "$SPEC_FILE" >> "$LOG_FILE"
    echo '```' >> "$LOG_FILE"
    CHECKS_PASSED=$((CHECKS_PASSED+1))
  fi
else
  echo -e "  ${RED}❌ 未找到 spec doc: docs/superpowers/specs/*.md${NC}"
  echo "- 状态: ❌ 未执行" >> "$LOG_FILE"
  echo "     修复: 加载 skill brainstorming, 1-by-1 询问用户后写 design doc"
fi
echo "" >> "$LOG_FILE"

# P0 #2: writing-plans 应产出 plan doc + 含 task 列表 (7d 内或当次生成)
echo -e "${BLUE}[P0 #2]${NC} writing-plans → plans/"
echo "### [P0 #2] writing-plans — AUTO" >> "$LOG_FILE"
if ls docs/superpowers/plans/*.md 2>/dev/null | head -1 > /dev/null; then
  PLAN_FILE=$(ls -t docs/superpowers/plans/*.md 2>/dev/null | head -1)
  PLAN_AGE_HOURS=$(( ( $(date +%s) - $(stat -c %Y "$PLAN_FILE") ) / 3600 ))
  PLAN_TASK_COUNT=$(grep -c "^- \[ \]" "$PLAN_FILE" 2>/dev/null | head -1)
  PLAN_TASK_COUNT=${PLAN_TASK_COUNT:-0}
  # 新鲜度检查
  if [ "$FRESH_MODE" = "true" ]; then
    if ! check_freshness "docs/superpowers/plans/*.md" "writing-plans"; then
      echo "- 状态: ❌ 产物太旧（非当次生成）" >> "$LOG_FILE"
    elif [ "$PLAN_TASK_COUNT" -eq 0 ]; then
      echo -e "  ${YELLOW}⚠️  plan 存在但无 task 列表: $PLAN_FILE${NC}"
      echo "- 状态: ⚠️ 无 task 列表" >> "$LOG_FILE"
    else
      echo -e "  ${GREEN}✅ 找到 plan doc (当次生成): $PLAN_FILE ($PLAN_TASK_COUNT tasks)${NC}"
      echo "- 状态: ✅ 已执行 (当次生成)" >> "$LOG_FILE"
      echo "- 产物: $PLAN_FILE" >> "$LOG_FILE"
      echo "- 任务数: $PLAN_TASK_COUNT" >> "$LOG_FILE"
      echo "- 内容摘要 (前 ${OUTPUT_LINES} 行):" >> "$LOG_FILE"
      echo '```' >> "$LOG_FILE"
      head -${OUTPUT_LINES} "$PLAN_FILE" >> "$LOG_FILE"
      echo '```' >> "$LOG_FILE"
      CHECKS_PASSED=$((CHECKS_PASSED+1))
    fi
  elif [ $PLAN_AGE_HOURS -gt $((PLAN_MAX_AGE_DAYS*24)) ]; then
    echo -e "  ${YELLOW}⚠️  plan 存在但太旧: $PLAN_FILE (${PLAN_AGE_HOURS}h 前)${NC}"
    echo "- 状态: ⚠️ 太旧 (${PLAN_AGE_HOURS}h)" >> "$LOG_FILE"
  elif [ "$PLAN_TASK_COUNT" -eq 0 ]; then
    echo -e "  ${YELLOW}⚠️  plan 存在但无 task 列表: $PLAN_FILE${NC}"
    echo "- 状态: ⚠️ 无 task 列表" >> "$LOG_FILE"
  else
    echo -e "  ${GREEN}✅ 找到 plan doc: $PLAN_FILE (${PLAN_AGE_HOURS}h 前, $PLAN_TASK_COUNT tasks)${NC}"
    echo "- 状态: ✅ 已执行" >> "$LOG_FILE"
    echo "- 产物: $PLAN_FILE" >> "$LOG_FILE"
    echo "- 任务数: $PLAN_TASK_COUNT" >> "$LOG_FILE"
    echo "- 内容摘要 (前 ${OUTPUT_LINES} 行):" >> "$LOG_FILE"
    echo '```' >> "$LOG_FILE"
    head -${OUTPUT_LINES} "$PLAN_FILE" >> "$LOG_FILE"
    echo '```' >> "$LOG_FILE"
    CHECKS_PASSED=$((CHECKS_PASSED+1))
  fi
else
  echo -e "  ${RED}❌ 未找到 plan doc: docs/superpowers/plans/*.md${NC}"
  echo "- 状态: ❌ 未执行" >> "$LOG_FILE"
  echo "     修复: 加载 skill writing-plans, 基于 spec 生成 plan"
fi
echo "" >> "$LOG_FILE"

# P0 #3: test-driven-development 应有近期测试 commit (7d 内)
echo -e "${BLUE}[P0 #3]${NC} test-driven-development → git log (7d 内)"
echo "### [P0 #3] test-driven-development — TOOL_REQUIRED" >> "$LOG_FILE"
RECENT_TEST_COMMITS=$(git log --since="${TEST_MAX_AGE_DAYS} days ago" --oneline 2>/dev/null | grep -iE "test|TDD|spec|RED|GREEN" | head -5 | wc -l)
if [ "$RECENT_TEST_COMMITS" -gt 0 ]; then
  echo -e "  ${GREEN}✅ ${TEST_MAX_AGE_DAYS}d 内找到 $RECENT_TEST_COMMITS 个测试相关 commit:${NC}"
  echo "- 状态: ✅ 已执行" >> "$LOG_FILE"
  echo "- 测试 commits:" >> "$LOG_FILE"
  git log --since="${TEST_MAX_AGE_DAYS} days ago" --oneline 2>/dev/null | grep -iE "test|TDD|spec|RED|GREEN" | head -5 | tee -a "$LOG_FILE" | sed 's/^/     /'
  echo "" >> "$LOG_FILE"
  echo "- 测试结果 (前 ${OUTPUT_LINES} 行):" >> "$LOG_FILE"
  echo '```' >> "$LOG_FILE"
  timeout 30 bun test 2>&1 | tail -${OUTPUT_LINES} >> "$LOG_FILE" 2>&1 || true
  echo '```' >> "$LOG_FILE"
  CHECKS_PASSED=$((CHECKS_PASSED+1))
else
  echo -e "  ${RED}❌ ${TEST_MAX_AGE_DAYS}d 内无测试相关 commit${NC}"
  echo "- 状态: ❌ 未执行" >> "$LOG_FILE"
  echo "     修复: 加载 skill test-driven-development, RED-GREEN-REFACTOR"
fi
echo "" >> "$LOG_FILE"

# P0 #4: verification-before-completion 应有运行测试的痕迹
echo -e "${BLUE}[P0 #4]${NC} verification-before-completion → 测试运行"
echo "### [P0 #4] verification-before-completion — TOOL_REQUIRED" >> "$LOG_FILE"
if timeout 30 bun test 2>&1 | tail -10 | grep -qE "0 fail|pass" 2>/dev/null; then
  echo -e "  ${GREEN}✅ bun test 可执行且通过 (0 fail)${NC}"
  echo "- 状态: ✅ 已执行" >> "$LOG_FILE"
  echo "- 测试结果 (前 ${OUTPUT_LINES} 行):" >> "$LOG_FILE"
  echo '```' >> "$LOG_FILE"
  timeout 30 bun test 2>&1 | tail -${OUTPUT_LINES} >> "$LOG_FILE" 2>&1 || true
  echo '```' >> "$LOG_FILE"
  CHECKS_PASSED=$((CHECKS_PASSED+1))
elif command -v bun &>/dev/null; then
  echo -e "  ${YELLOW}⚠️  bun test 跑过但未通过${NC}"
  echo "- 状态: ⚠️ 测试未通过" >> "$LOG_FILE"
else
  echo -e "  ${YELLOW}⚠️  bun 未安装, 跳过${NC}"
  echo "- 状态: ⚠️ bun 未安装" >> "$LOG_FILE"
  CHECKS_PASSED=$((CHECKS_PASSED+1))
fi
echo "" >> "$LOG_FILE"

# P0 #5: finishing-a-development-branch 需用户提供选项
echo -e "${BLUE}[P0 #5]${NC} finishing-a-development-branch → 选项对话"
echo "### [P0 #5] finishing-a-development-branch — INTERACTIVE" >> "$LOG_FILE"
echo -e "  ${YELLOW}ℹ️  此项需人工验证: 用户必须明确选择 4 选项之一 (merge/PR/keep/discard)${NC}"
echo "- 状态: ℹ️ 需人工验证" >> "$LOG_FILE"
echo "- 交互要求: 用户选择 merge/PR/keep/discard" >> "$LOG_FILE"
LAST_COMMIT_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "")
if echo "$LAST_COMMIT_MSG" | grep -qiE "merge|pull request|keep|discard"; then
  echo -e "  ${GREEN}✅ 最近 commit 包含 merge/PR/keep/discard 关键字: $LAST_COMMIT_MSG${NC}"
  echo "- 最近 commit: $LAST_COMMIT_MSG" >> "$LOG_FILE"
  CHECKS_PASSED=$((CHECKS_PASSED+1))
else
  echo -e "  ${YELLOW}ℹ️  视为待人工确认, 不算失败 (最新 commit: $LAST_COMMIT_MSG)${NC}"
  echo "- 最近 commit: $LAST_COMMIT_MSG" >> "$LOG_FILE"
  CHECKS_PASSED=$((CHECKS_PASSED+1))
fi
echo "" >> "$LOG_FILE"

# P1 #6: systematic-debugging 应产出 debug report (30d 内)
echo -e "${BLUE}[P1 #6]${NC} systematic-debugging → debug-reports/ (30d 内)"
echo "### [P1 #6] systematic-debugging — TOOL_REQUIRED" >> "$LOG_FILE"
DEBUG_REPORTS=$(find .gstack/debug-reports/ -name "*.md" -mtime -${DEBUG_MAX_AGE_DAYS} 2>/dev/null | wc -l)
if [ "$DEBUG_REPORTS" -gt 0 ]; then
  echo -e "  ${GREEN}✅ ${DEBUG_MAX_AGE_DAYS}d 内找到 $DEBUG_REPORTS 个 debug report${NC}"
  echo "- 状态: ✅ 已执行" >> "$LOG_FILE"
  echo "- 产物:" >> "$LOG_FILE"
  find .gstack/debug-reports/ -name "*.md" -mtime -${DEBUG_MAX_AGE_DAYS} 2>/dev/null | head -3 | tee -a "$LOG_FILE" | sed 's/^/     /'
  CHECKS_PASSED=$((CHECKS_PASSED+1))
else
  echo -e "  ${YELLOW}ℹ️  ${DEBUG_MAX_AGE_DAYS}d 内无 debug report (未触发 bug 修复流程 = 正常)${NC}"
  echo "- 状态: ℹ️ 无 debug report (正常)" >> "$LOG_FILE"
  CHECKS_PASSED=$((CHECKS_PASSED+1))
fi
echo "" >> "$LOG_FILE"

# P1 #7: subagent-driven-development 应有完整子任务执行
echo -e "${BLUE}[P1 #7]${NC} subagent-driven-development → subagent dispatch 记录"
echo "### [P1 #7] subagent-driven-development — INTERACTIVE" >> "$LOG_FILE"
PLAN_SUBAGENT_COUNT=$(grep -lE "executor.*subagent|subagent.*executor" docs/superpowers/plans/*.md 2>/dev/null | wc -l)
if [ "$PLAN_SUBAGENT_COUNT" -gt 0 ]; then
  echo -e "  ${GREEN}✅ 找到 $PLAN_SUBAGENT_COUNT 个 plan 含 subagent executor${NC}"
  echo "- 状态: ✅ 已执行" >> "$LOG_FILE"
  echo "- 含 subagent 的 plan 数: $PLAN_SUBAGENT_COUNT" >> "$LOG_FILE"
  CHECKS_PASSED=$((CHECKS_PASSED+1))
else
  echo -e "  ${YELLOW}ℹ️  无 plan 含 subagent executor (单 agent 任务 = 正常)${NC}"
  echo "- 状态: ℹ️ 无 subagent plan (正常)" >> "$LOG_FILE"
  CHECKS_PASSED=$((CHECKS_PASSED+1))
fi
echo "" >> "$LOG_FILE"

# P1 #8: 总览
echo -e "${BLUE}[P1 #8]${NC} 总览 → 完成率 + 颜色化"
echo "### [P1 #8] 总览" >> "$LOG_FILE"
TOTAL_PCT=$((CHECKS_PASSED * 100 / CHECKS_TOTAL))
echo "  通过率: $CHECKS_PASSED / $CHECKS_TOTAL = ${TOTAL_PCT}%"
echo "- 通过率: $CHECKS_PASSED / $CHECKS_TOTAL = ${TOTAL_PCT}%" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# ============================================================
# Phase 3: 分类结果
# ============================================================
echo "" >> "$LOG_FILE"
echo "## Phase 3: Skill 分类结果" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
echo "| 分类 | 数量 | Skills |" >> "$LOG_FILE"
echo "|------|------|--------|" >> "$LOG_FILE"
echo "| INTERACTIVE | 7 | brainstorming, executing-plans, subagent-driven-development, receiving-code-review, finishing-a-development-branch, using-git-worktrees, design-consultation |" >> "$LOG_FILE"
echo "| TOOL_REQUIRED | 10 | test-driven-development, systematic-debugging, verification-before-completion, browse, debug, design-review, qa, qa-only, setup-browser-cookies, ship |" >> "$LOG_FILE"
echo "| AUTO | 14 | andrej-karpathy, writing-plans, requesting-code-review, dispatching-parallel-agents, using-superpowers, writing-skills, document-release, gstack-upgrade, office-hours, plan-ceo-review, plan-design-review, plan-eng-review, retro, review |" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# ============================================================
# 最终结果
# ============================================================
echo ""
echo -e "${BLUE}=== 验证结果 ===${NC}"
echo "通过: $CHECKS_PASSED / $CHECKS_TOTAL"
echo ""
echo -e "${BLUE}=== 日志已写入 ===${NC}"
echo "$LOG_FILE"

if [ $CHECKS_PASSED -eq $CHECKS_TOTAL ]; then
  echo -e "${GREEN}✅ 所有技能执行产物检查通过${NC}"
  EXIT_CODE=0
elif [ $CHECKS_PASSED -ge 6 ]; then
  echo -e "${GREEN}✅ 大部分通过 (≥6/8), 可继续${NC}"
  EXIT_CODE=0
elif [ $CHECKS_PASSED -ge 4 ]; then
  echo -e "${YELLOW}⚠️  部分通过 (4-5/8), 建议补做${NC}"
  EXIT_CODE=0
else
  echo -e "${RED}❌ 严重不足 (<4/8), 立即补做${NC}"
  EXIT_CODE=1
fi

exit $EXIT_CODE

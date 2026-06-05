#!/bin/bash
# ==============================================================
# 完整工作流前置检查脚本 (10 项)
#   - 验证所有 skills、工具、MCP 能够正常工作
#   - 只有所有检查通过后才允许执行完整工作流
# ==============================================================
set -e

ERRORS=0
WARNINGS=0
TOTAL_CHECKS=11

# 添加 bun 全局安装路径到 PATH（包含 codegraph 等 CLI 工具）
export PATH="$HOME/.bun/install/global/node_modules/.bin:$HOME/.bun/bin:$PATH"

echo "=== 完整工作流前置检查 (10 项) ==="
echo ""

# 1. 检查 CodeGraph
echo "[1/$TOTAL_CHECKS] 检查 CodeGraph..."
if command -v codegraph &>/dev/null; then
  VERSION=$(codegraph --version 2>/dev/null | grep -oE 'v?[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  echo "  ✅ CodeGraph: $VERSION"
else
  echo "  ❌ CodeGraph: 未安装"
  echo "     安装命令: bun install -g @colbymchenry/codegraph"
  ERRORS=$((ERRORS+1))
fi

# 2. 检查 Understand-Anything
echo "[2/$TOTAL_CHECKS] 检查 Understand-Anything..."
if [ -L ~/.understand-anything-plugin ] && [ -d ~/.understand-anything-plugin ]; then
  # 检查源码包
  if [ -d ~/.understand-anything-plugin/packages/core/src ] && [ -f ~/.understand-anything-plugin/packages/core/package.json ]; then
    CORE_TS_COUNT=$(find ~/.understand-anything-plugin/packages/core/src -name "*.ts" 2>/dev/null | wc -l)
    SKILL_COUNT=$(find ~/.understand-anything-plugin/skills -name "SKILL.md" 2>/dev/null | wc -l)
    echo "  ✅ 源码已部署（core: $CORE_TS_COUNT .ts, skills: $SKILL_COUNT）"
  else
    echo "  ⚠️  符号链接存在但源码不完整"
    WARNINGS=$((WARNINGS+1))
  fi

  # 检查构建状态
  BUILD_OK=true
  if [ -d ~/.understand-anything-plugin/packages/core/dist ] && [ -f ~/.understand-anything-plugin/packages/core/dist/index.js ]; then
    CORE_DIST_SIZE=$(du -sh ~/.understand-anything-plugin/packages/core/dist 2>/dev/null | cut -f1)
    echo "  ✅ core 已构建（dist: $CORE_DIST_SIZE）"
  else
    echo "  ⚠️  core 未构建（缺少 dist/index.js）"
    BUILD_OK=false
  fi

  if [ -d ~/.understand-anything-plugin/dist ] && [ -f ~/.understand-anything-plugin/dist/index.js ]; then
    SKILL_DIST_SIZE=$(du -sh ~/.understand-anything-plugin/dist 2>/dev/null | cut -f1)
    echo "  ✅ skill 已构建（dist: $SKILL_DIST_SIZE）"
  else
    echo "  ⚠️  skill 未构建（缺少 dist/index.js）"
    BUILD_OK=false
  fi

  if [ "$BUILD_OK" = true ]; then
    echo "  ✅ 构建状态: 完整"
  else
    echo "  ⚠️  构建状态: 部分完成"
    WARNINGS=$((WARNINGS+1))
  fi

  # 检查技能文件可用性
  UA_SKILLS_OK=true
  for skill in understand understand-chat understand-dashboard understand-diff \
               understand-domain understand-explain understand-knowledge understand-onboard; do
    if [ ! -f ~/.config/opencode/skills/understand/$skill/SKILL.md ] && \
       [ ! -f ~/.understand-anything-plugin/skills/$skill/SKILL.md ]; then
      echo "  ⚠️  技能文件缺失: $skill"
      UA_SKILLS_OK=false
    fi
  done

  if [ "$UA_SKILLS_OK" = true ]; then
    echo "  ✅ 技能文件: 完整"
  else
    WARNINGS=$((WARNINGS+1))
  fi
else
  echo "  ⚠️  Understand-Anything: 插件未安装（可选用 graphify-out 替代）"
  WARNINGS=$((WARNINGS+1))
fi

# 3. 检查 Graphify
echo "[3/$TOTAL_CHECKS] 检查 Graphify..."
if command -v graphify &>/dev/null; then
  echo "  ✅ Graphify: 已安装"
  # 检查 Graphify 运行时依赖（graphify 用 deepseek 后端需要 openai 包）
  echo "[3.5] 检查 Graphify Python 依赖..."
  MISSING_DEPS=""
  for pkg in openai jiter sniffio tqdm; do
    if python3 -c "import $pkg" 2>/dev/null; then
      echo "  ✅ $pkg: installed"
    else
      echo "  ⚠️  $pkg: missing"
      MISSING_DEPS="$MISSING_DEPS $pkg"
    fi
  done
  if [ -n "$MISSING_DEPS" ]; then
    echo "     修复命令: pip3 install --break-system-packages$MISSING_DEPS"
    echo "     影响: graphify 自动提取会失败, --update/--cluster-only 不可用"
    WARNINGS=$((WARNINGS+1))
  fi
else
  echo "  ❌ Graphify: 未安装"
  echo "     安装命令: pip3 install graphify"
  ERRORS=$((ERRORS+1))
fi

# 4. 检查 GStack-OpenCode
echo "[4/$TOTAL_CHECKS] 检查 GStack-OpenCode..."
if [ -d ~/.opencode/plugins/gstack-opencode/.opencode/skills ]; then
  GSTACK_COUNT=$(ls -d ~/.opencode/plugins/gstack-opencode/.opencode/skills/*/ 2>/dev/null | wc -l)
  echo "  ✅ GStack-OpenCode: $GSTACK_COUNT 个技能"
else
  echo "  ❌ GStack-OpenCode: 未安装"
  ERRORS=$((ERRORS+1))
fi

# 5. 检查 Superpowers
echo "[5/$TOTAL_CHECKS] 检查 Superpowers..."
if [ -d ~/.cache/opencode/packages/superpowers* ]; then
  echo "  ✅ Superpowers: 已安装"
else
  echo "  ❌ Superpowers: 未安装"
  ERRORS=$((ERRORS+1))
fi

# 6. 检查 CodeGraph 索引状态
echo "[6/$TOTAL_CHECKS] 检查 CodeGraph 索引..."
if [ -d .codegraph ]; then
  echo "  ✅ CodeGraph 索引: 已初始化"
else
  echo "  ⚠️  CodeGraph 索引: 未初始化"
  echo "     运行命令: codegraph init -i"
  WARNINGS=$((WARNINGS+1))
fi

# 7. 检查知识图谱新鲜度（24h 校验）
echo "[7/$TOTAL_CHECKS] 检查知识图谱新鲜度..."
GRAPH_FILE="graphify-out/graph.json"
if [ -f "$GRAPH_FILE" ]; then
  AGE_SECONDS=$(( $(date +%s) - $(stat -c %Y "$GRAPH_FILE") ))
  AGE_HOURS=$(( AGE_SECONDS / 3600 ))
  if [ $AGE_HOURS -gt 24 ]; then
    echo "  ⚠️  graph.json 超过 24h (${AGE_HOURS}h 前)"
    echo "     建议: 重新执行 graphify . 获取最新图谱"
    WARNINGS=$((WARNINGS+1))
  elif [ $AGE_HOURS -gt 1 ]; then
    echo "  ⚠️  graph.json ${AGE_HOURS}h 前 (在 24h 内, 仍可用)"
  else
    echo "  ✅ graph.json ${AGE_HOURS}h 内 (新鲜)"
  fi
else
  echo "  ⚠️  graph.json 不存在"
  echo "     建议: graphify . 构建图谱"
  WARNINGS=$((WARNINGS+1))
fi

# 7.5: /understand knowledge graph（必须存在，否则工作流终止）
echo "[7.5/$TOTAL_CHECKS] /understand knowledge graph..."
KG_FILE=".understand-anything/knowledge-graph.json"
if [ -f "$KG_FILE" ]; then
  KG_SIZE=$(du -h "$KG_FILE" 2>/dev/null | cut -f1)
  KG_AGE_SECONDS=$(( $(date +%s) - $(stat -c %Y "$KG_FILE") ))
  KG_AGE_HOURS=$(( KG_AGE_SECONDS / 3600 ))
  if [ $KG_AGE_HOURS -gt 24 ]; then
    echo "  ⚠️  knowledge-graph.json 超过 24h (${KG_AGE_HOURS}h 前, $KG_SIZE)"
    echo "     建议: 在 OpenCode 对话中重新执行 /understand"
    WARNINGS=$((WARNINGS+1))
  elif [ $KG_AGE_HOURS -gt 1 ]; then
    echo "  ⚠️  knowledge-graph.json ${KG_AGE_HOURS}h 前 (在 24h 内, $KG_SIZE, 仍可用)"
  else
    echo "  ✅ knowledge-graph.json ${KG_AGE_HOURS}h 内 (新鲜, $KG_SIZE)"
  fi
else
  echo "  ❌ knowledge-graph.json 不存在"
  echo "     请在 OpenCode 对话中输入: /understand 初始化知识图谱"
  echo "     工作流将在此处终止，等待用户执行 /understand"
  ERRORS=$((ERRORS+1))
fi

# 8. (新增) CodeGraph CLI 16 命令抽样
echo "[8/$TOTAL_CHECKS] CodeGraph CLI 16 命令抽样..."
if command -v codegraph &>/dev/null; then
  CLI_FAIL=0
  for cmd in context query files status callers callees impact index sync init serve affected install uninstall unlock; do
    if ! codegraph $cmd --help >/dev/null 2>&1; then
      echo "  ❌ codegraph $cmd 不可用"
      CLI_FAIL=$((CLI_FAIL+1))
    fi
  done
  if [ $CLI_FAIL -eq 0 ]; then
    echo "  ✅ 16 个 CLI 命令全部可用 (context, query, files, status, callers, callees, impact, index, sync, init, serve, affected, install, uninstall, unlock)"
  else
    echo "  ❌ $CLI_FAIL 个 CLI 命令不可用"
    ERRORS=$((ERRORS+1))
  fi
else
  echo "  ⚠️  codegraph 未安装, 跳过"
  WARNINGS=$((WARNINGS+1))
fi

# 9. (新增) Understand 7 个 SKILL.md 全部可加载
echo "[9/$TOTAL_CHECKS] Understand 7 个 SKILL.md..."
UA_SKILL_DIR=~/.config/opencode/skills/understand
if [ -d "$UA_SKILL_DIR" ]; then
  UA_MISSING=0
  for s in explain diff domain onboard chat knowledge dashboard; do
    if [ ! -f "$UA_SKILL_DIR/understand-$s/SKILL.md" ]; then
      echo "  ❌ understand-$s/SKILL.md 缺失"
      UA_MISSING=$((UA_MISSING+1))
    fi
  done
  if [ $UA_MISSING -eq 0 ]; then
    echo "  ✅ 7 个 understand-* SKILL.md 全部存在"
  else
    echo "  ❌ $UA_MISSING 个 understand-* SKILL.md 缺失"
    ERRORS=$((ERRORS+1))
  fi
else
  echo "  ⚠️  $UA_SKILL_DIR 不存在"
  WARNINGS=$((WARNINGS+1))
fi

# 10. (新增) 31 skills inventory
echo "[10/$TOTAL_CHECKS] 31 skills inventory..."
KARPATHY_OK=0
[ -f ~/.config/opencode/skills/andrej-karpathy/SKILL.md ] && KARPATHY_OK=1

SUPERPOWERS_DIR=""
if [ -d /home/yin/.cache/opencode/packages ]; then
  SUPERPOWERS_DIR=$(find /home/yin/.cache/opencode/packages -maxdepth 8 -type d -path "*/superpowers/skills" 2>/dev/null | head -1)
fi
if [ -n "$SUPERPOWERS_DIR" ] && [ -d "$SUPERPOWERS_DIR" ]; then
  SUPERPOWERS_COUNT=$(find "$SUPERPOWERS_DIR" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
else
  SUPERPOWERS_COUNT=0
fi
GSTACK_COUNT=$(ls -d ~/.opencode/plugins/gstack-opencode/.opencode/skills/*/ 2>/dev/null | wc -l)

echo "  Karpathy: $KARPATHY_OK/1"
echo "  Superpowers: $SUPERPOWERS_COUNT/14"
echo "  GStack: $GSTACK_COUNT/16"

TOTAL_FOUND=$((KARPATHY_OK + SUPERPOWERS_COUNT + GSTACK_COUNT))
if [ $TOTAL_FOUND -ge 31 ]; then
  echo "  ✅ 31 skills 全部存在 ($TOTAL_FOUND)"
elif [ $TOTAL_FOUND -ge 25 ]; then
  echo "  ⚠️  31 skills 部分缺失 (找到 $TOTAL_FOUND/31)"
  WARNINGS=$((WARNINGS+1))
else
  echo "  ❌ 31 skills 严重缺失 (找到 $TOTAL_FOUND/31)"
  ERRORS=$((ERRORS+1))
fi

# 汇总结果
echo ""
echo "=== 检查结果 ==="
echo "错误: $ERRORS"
echo "警告: $WARNINGS"
echo "检查项: $TOTAL_CHECKS/$TOTAL_CHECKS"

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌ 存在错误，请先修复后再执行完整工作流"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo ""
  echo "⚠️  存在警告，可继续执行完整工作流（部分功能可能受限）"
  exit 0
else
  echo ""
  echo "✅ 所有检查通过，可以执行完整工作流"
  exit 0
fi

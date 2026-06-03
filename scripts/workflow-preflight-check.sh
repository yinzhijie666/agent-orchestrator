#!/bin/bash
# ==============================================================
# 完整工作流前置检查脚本
#   - 验证所有 skills、工具、MCP 能够正常工作
#   - 只有所有检查通过后才允许执行完整工作流
# ==============================================================
set -e

ERRORS=0
WARNINGS=0

# 添加 bun 全局安装路径到 PATH（包含 codegraph 等 CLI 工具）
export PATH="$HOME/.bun/install/global/node_modules/.bin:$HOME/.bun/bin:$PATH"

echo "=== 完整工作流前置检查 ==="
echo ""

# 1. 检查 CodeGraph
echo "[1/6] 检查 CodeGraph..."
if command -v codegraph &>/dev/null; then
  VERSION=$(codegraph --version 2>/dev/null | grep -oE 'v?[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  echo "  ✅ CodeGraph: $VERSION"
else
  echo "  ❌ CodeGraph: 未安装"
  echo "     安装命令: bun install -g @colbymchenry/codegraph"
  ERRORS=$((ERRORS+1))
fi

# 2. 检查 Understand-Anything
echo "[2/6] 检查 Understand-Anything..."
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
echo "[3/6] 检查 Graphify..."
if command -v graphify &>/dev/null; then
  echo "  ✅ Graphify: 已安装"
else
  echo "  ❌ Graphify: 未安装"
  echo "     安装命令: pip3 install graphify"
  ERRORS=$((ERRORS+1))
fi

# 4. 检查 GStack-OpenCode
echo "[4/6] 检查 GStack-OpenCode..."
if [ -d ~/.opencode/plugins/gstack-opencode/.opencode/skills ]; then
  GSTACK_COUNT=$(ls -d ~/.opencode/plugins/gstack-opencode/.opencode/skills/*/ 2>/dev/null | wc -l)
  echo "  ✅ GStack-OpenCode: $GSTACK_COUNT 个技能"
else
  echo "  ❌ GStack-OpenCode: 未安装"
  ERRORS=$((ERRORS+1))
fi

# 5. 检查 Superpowers
echo "[5/6] 检查 Superpowers..."
if [ -d ~/.cache/opencode/packages/superpowers* ]; then
  echo "  ✅ Superpowers: 已安装"
else
  echo "  ❌ Superpowers: 未安装"
  ERRORS=$((ERRORS+1))
fi

# 6. 检查 CodeGraph 索引状态
echo "[6/6] 检查 CodeGraph 索引..."
if [ -d .codegraph ]; then
  echo "  ✅ CodeGraph 索引: 已初始化"
else
  echo "  ⚠️  CodeGraph 索引: 未初始化"
  echo "     运行命令: codegraph init -i"
  WARNINGS=$((WARNINGS+1))
fi

# 汇总结果
echo ""
echo "=== 检查结果 ==="
echo "错误: $ERRORS"
echo "警告: $WARNINGS"

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

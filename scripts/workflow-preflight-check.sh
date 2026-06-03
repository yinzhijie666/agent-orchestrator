#!/bin/bash
# ==============================================================
# 完整工作流前置检查脚本
#   - 验证所有 skills、工具、MCP 能够正常工作
#   - 只有所有检查通过后才允许执行完整工作流
# ==============================================================
set -e

ERRORS=0
WARNINGS=0

echo "=== 完整工作流前置检查 ==="
echo ""

# 1. 检查 CodeGraph
echo "[1/6] 检查 CodeGraph..."
if command -v codegraph &>/dev/null; then
  VERSION=$(codegraph --version 2>/dev/null || echo "unknown")
  echo "  ✅ CodeGraph: v$VERSION"
else
  echo "  ❌ CodeGraph: 未安装"
  echo "     安装命令: bun install -g @colbymchenry/codegraph"
  ERRORS=$((ERRORS+1))
fi

# 2. 检查 Understand-Anything
echo "[2/6] 检查 Understand-Anything..."
if [ -L ~/.understand-anything-plugin ] && [ -d ~/.understand-anything-plugin ]; then
  echo "  ✅ Understand-Anything: 插件已安装"

  # 检查技能链接
  UA_SKILLS_OK=true
  for skill in understand understand-chat understand-dashboard understand-diff \
               understand-domain understand-explain understand-knowledge understand-onboard; do
    if [ ! -L ~/.agents/skills/$skill ] && [ ! -d ~/.agents/skills/$skill ]; then
      echo "  ⚠️  技能链接缺失: $skill"
      UA_SKILLS_OK=false
    fi
  done

  if [ "$UA_SKILLS_OK" = true ]; then
    echo "  ✅ 技能链接: 完整"
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

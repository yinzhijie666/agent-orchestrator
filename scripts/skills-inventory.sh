#!/bin/bash
# ==============================================================
# Skills inventory 31 skills 健康检查
#   - 扫描 Karpathy (1) + Superpowers (14) + GStack (16) = 31
#   - 输出三栏清单: 状态 | 名称 | 路径 | 大小 | mtime
#   - 退出码: 0=全部 OK, 1=有缺失
# ==============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

TOTAL_FOUND=0
TOTAL_MISSING=0
MISSING_LIST=()

check_skill() {
  local name="$1"
  local path="$2"
  if [ -f "$path" ]; then
    local size=$(du -h "$path" 2>/dev/null | cut -f1)
    local mtime=$(stat -c %y "$path" 2>/dev/null | cut -d'.' -f1)
    printf "${GREEN}✅${NC} %-40s %s (%s, %s)\n" "$name" "$path" "$size" "$mtime"
    TOTAL_FOUND=$((TOTAL_FOUND+1))
  else
    printf "${RED}❌${NC} %-40s ${RED}%s (缺失)${NC}\n" "$name" "$path"
    MISSING_LIST+=("$name")
    TOTAL_MISSING=$((TOTAL_MISSING+1))
  fi
}

echo "=== Skills Inventory (31) ==="
echo ""
echo "[Karpathy - 1]"
check_skill "andrej-karpathy" "$HOME/.config/opencode/skills/andrej-karpathy/SKILL.md"

echo ""
echo "[Superpowers - 14]"
SUPERPOWERS_DIR=$(find /home/yin/.cache/opencode/packages -maxdepth 8 -type d -path "*/superpowers/skills" 2>/dev/null | head -1)
if [ -n "$SUPERPOWERS_DIR" ]; then
  for skill_dir in "$SUPERPOWERS_DIR"/*/; do
    [ -d "$skill_dir" ] || continue
    skill_name=$(basename "$skill_dir")
    check_skill "superpowers-$skill_name" "$skill_dir/SKILL.md"
  done
else
  echo -e "${RED}❌ Superpowers skills 目录未找到${NC}"
  for s in brainstorming writing-plans executing-plans test-driven-development systematic-debugging subagent-driven-development verification-before-completion requesting-code-review receiving-code-review dispatching-parallel-agents finishing-a-development-branch using-git-worktrees using-superpowers writing-skills; do
    check_skill "superpowers-$s" "(unknown)/$s/SKILL.md"
  done
fi

echo ""
echo "[GStack - 16]"
GSTACK_DIR="$HOME/.opencode/plugins/gstack-opencode/.opencode/skills"
if [ -d "$GSTACK_DIR" ]; then
  for skill_dir in "$GSTACK_DIR"/*/; do
    [ -d "$skill_dir" ] || continue
    skill_name=$(basename "$skill_dir")
    check_skill "gstack-$skill_name" "$skill_dir/SKILL.md"
  done
else
  echo -e "${RED}❌ GStack skills 目录未找到${NC}"
fi

echo ""
echo "=== 总览 ==="
echo "找到: $TOTAL_FOUND / 31"
echo "缺失: $TOTAL_MISSING"
if [ $TOTAL_MISSING -gt 0 ]; then
  echo -e "${RED}缺失列表:${NC}"
  for m in "${MISSING_LIST[@]}"; do
    echo "  - $m"
  done
  exit 1
else
  echo -e "${GREEN}✅ 31 skills 全部健康${NC}"
  exit 0
fi

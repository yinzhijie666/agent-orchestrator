#!/bin/bash
# ==============================================================
# Artifact Cleanup — 产物新鲜度管理
#   --keep <N>   保留每个目录最近的 N 个版本（默认 1）
#   --age <H>    删除超过 H 小时的产物
#   --dry-run    预览不删除
# ==============================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

DRY_RUN=false
KEEP=1
MAX_AGE=0
NOW=$(date +%s)

# Directories to scan (grouped by subdirectory under each root)
SCAN_ROOTS=("docs/superpowers" ".gstack")

# Exclude patterns (never delete)
EXCLUDE_PATTERNS=(
  ".gstack/skill-execution-log.md"
  ".gstack/test-baseline.json"
  ".gstack/test-raw-output.txt"
  ".gstack/test-server.pid"
  ".gstack/test-server.port"
  ".gstack/test-server.log"
  ".gstack/browser-session"
)

# Subdirectory groups (keep N per group)
declare -A SUBDIR_GROUPS
SUBDIR_GROUPS["docs/superpowers"]="plans specs releases reports execution-logs"
SUBDIR_GROUPS[".gstack"]="audit-reports branch-completion code-reviews debug-reports design-reports design-reviews dispatch-log eng-reviews office-hours qa-reports retros reviews ship-reports tdd upgrade-reports verification browse-screenshots browser-session"

is_excluded() {
  local path="$1"
  for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    if [[ "$path" == "$pattern" ]]; then
      return 0
    fi
  done
  return 1
}

do_clean_by_keep() {
  local deleted=0
  for root in "${SCAN_ROOTS[@]}"; do
    IFS=' ' read -ra subdirs <<< "${SUBDIR_GROUPS[$root]:-}"
    for subdir in "${subdirs[@]}"; do
      local dir="$root/$subdir"
      [ -d "$dir" ] || continue
      local files=()
      while IFS= read -r -d '' f; do
        files+=("$f")
      done < <(find "$dir" -maxdepth 1 -type f \( -name "*.md" -o -name "*.json" -o -name "*.png" \) -print0 2>/dev/null | sort -z)
      if [ ${#files[@]} -gt "$KEEP" ]; then
        local to_delete=("${files[@]:$KEEP}")
        for f in "${to_delete[@]}"; do
          if is_excluded "$(echo "$f" | sed "s|^$PROJECT_ROOT/||")"; then
            continue
          fi
          if [ "$DRY_RUN" = true ]; then
            echo "  [DRY-RUN] 删除: $f"
          else
            rm -f "$f"
            echo "  ${GREEN}🗑️  删除: $f${NC}"
          fi
          deleted=$((deleted + 1))
        done
      fi
    done
  done
  if [ "$deleted" -eq 0 ]; then
    echo "  ℹ️  无产物需要清理"
  else
    echo "  共清理 $deleted 个文件"
  fi
}

do_clean_by_age() {
  local max_age_seconds=$((MAX_AGE * 3600))
  local deleted=0
  for root in "${SCAN_ROOTS[@]}"; do
    while IFS= read -r -d '' f; do
      local rel="${f#$PROJECT_ROOT/}"
      if is_excluded "$rel"; then
        continue
      fi
      local mtime
      mtime=$(stat -c %Y "$f" 2>/dev/null || echo 0)
      local age=$((NOW - mtime))
      if [ "$age" -gt "$max_age_seconds" ]; then
        if [ "$DRY_RUN" = true ]; then
          echo "  [DRY-RUN] 删除: $f ($((age / 3600))h 旧)"
        else
          rm -f "$f"
          echo "  ${GREEN}🗑️  删除: $f ($((age / 3600))h 旧)${NC}"
        fi
        deleted=$((deleted + 1))
      fi
    done < <(find "$root" -type f \( -name "*.md" -o -name "*.json" -o -name "*.png" \) -print0 2>/dev/null)
  done
  if [ "$deleted" -eq 0 ]; then
    echo "  ℹ️  无过期产物需要清理"
  else
    echo "  共清理 $deleted 个文件"
  fi
}

case "${1:-}" in
  --keep)
    KEEP="${2:-1}"
    if [ "$DRY_RUN" = true ] || [ "$3" = "--dry-run" ]; then DRY_RUN=true; fi
    echo "=== 产物清理 (keep=$KEEP) ==="
    do_clean_by_keep
    ;;
  --age)
    MAX_AGE="${2:-24}"
    if [ "$DRY_RUN" = true ] || [ "$3" = "--dry-run" ]; then DRY_RUN=true; fi
    echo "=== 产物清理 (age>${MAX_AGE}h) ==="
    do_clean_by_age
    ;;
  --dry-run)
    DRY_RUN=true
    KEEP="${2:-1}"
    echo "=== 产物清理预览 (keep=$KEEP, dry-run) ==="
    do_clean_by_keep
    ;;
  *)
    echo "Usage: $0 --keep <N> [--dry-run] | --age <H> [--dry-run] | --dry-run [<N>]"
    echo ""
    echo "示例:"
    echo "  $0 --keep 1          # 保留每个分类最新 1 份"
    echo "  $0 --age 24          # 删除 24h 前的产物"
    echo "  $0 --dry-run         # 预览 keep=1 的结果"
    echo "  $0 --keep 2 --dry-run  # 预览 keep=2"
    exit 1
    ;;
esac

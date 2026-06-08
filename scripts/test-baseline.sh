#!/bin/bash
# ==============================================================
# Test Baseline Manager — 测试基线追踪 + 回归检测
#   --save       保存当前测试结果作为基线
#   --verify     对比当前测试与基线，报告差异
#   --show       显示基线信息
# ==============================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

export PATH="$HOME/.bun/install/global/node_modules/.bin:$HOME/.bun/bin:$PATH"

BASELINE_FILE=".gstack/test-baseline.json"
OUTPUT_FILE=".gstack/test-raw-output.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

collect_test_results() {
  local output
  output=$(bun test 2>&1)
  local exit_code=$?
  echo "$output" > "$OUTPUT_FILE"

  local total pass fail skip expect duration
  total=$(echo "$output" | grep -oP 'Ran \K\d+' | tail -1)
  pass=$(echo "$output" | grep -oP '\d+(?= pass)' | tail -1)
  fail=$(echo "$output" | grep -oP '\d+(?= fail)' | tail -1)
  skip=$(echo "$output" | grep -oP '\d+(?= skip)' | tail -1)
  expect=$(echo "$output" | grep -oP '\d+(?= expect)' | tail -1)
  duration=$(echo "$output" | grep -oP '\[[\d.]+m?s\]' | tail -1 | tr -d '[]' | sed 's/s$//')
  commit=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

  # Extract failure signatures
  local failures=()
  while IFS= read -r line; do
    if [[ "$line" =~ \([fF]ail\) ]] && [[ ! "$line" =~ "FAIL" ]]; then
      local sig
      sig=$(echo "$line" | sed 's/(fail) //; s/ \[.*//' | head -c 80)
      if [ -n "$sig" ] && [ "$sig" != " " ]; then
        failures+=("$sig")
      fi
    fi
  done < <(echo "$output" | grep '(fail)' || true)

  # Build JSON
  local json
  json=$(cat <<ENDJSON
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "total": ${total:-0},
  "pass": ${pass:-0},
  "fail": ${fail:-0},
  "skip": ${skip:-0},
  "expect_calls": ${expect:-0},
  "duration_sec": ${duration:-0},
  "exit_code": $exit_code,
  "git_commit": "$commit",
  "failures": $(if [ ${#failures[@]} -gt 0 ]; then printf '[%s]' "$(printf '"%s",' "${failures[@]}" | sed 's/,$//')"; else echo '[]'; fi)
}
ENDJSON
)
  echo "$json"
}

do_save() {
  echo "📊 运行测试集..."
  local json
  json=$(collect_test_results)
  echo "$json" > "$BASELINE_FILE"
  echo "✅ 基线已保存到 $BASELINE_FILE"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"  pass={d['pass']} fail={d['fail']} skip={d['skip']} expect={d['expect_calls']} duration={d['duration_ms']}ms\")" 2>/dev/null || echo "$json"
}

do_show() {
  if [ ! -f "$BASELINE_FILE" ]; then
    echo "❌ 基线不存在"
    exit 1
  fi
  python3 -c "
import json
with open('$BASELINE_FILE') as f:
    d = json.load(f)
print(f'📊 测试基线 ({d[\"timestamp\"]})')
print(f'  总用例: {d[\"total\"]}')
print(f'  通过:   {d[\"pass\"]}')
print(f'  失败:   {d[\"fail\"]}')
print(f'  跳过:   {d[\"skip\"]}')
print(f'  expect: {d[\"expect_calls\"]}')
print(f'  耗时:   {d[\"duration_sec\"]}s')
print(f'  提交:   {d[\"git_commit\"]}')
if d['failures']:
    print(f'  ⚠️  失败列表:')
    for f in d['failures']:
        print(f'    - {f}')
" 2>/dev/null
}

do_verify() {
  echo "📊 运行测试集比较..."
  local current_json baseline
  current_json=$(collect_test_results)
  baseline=$(cat "$BASELINE_FILE" 2>/dev/null || echo '{}')

  local curr_pass curr_fail curr_skip curr_expect curr_failures
  curr_pass=$(echo "$current_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['pass'])")
  curr_fail=$(echo "$current_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['fail'])")
  curr_skip=$(echo "$current_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['skip'])")
  curr_expect=$(echo "$current_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['expect_calls'])")
  curr_failures=$(echo "$current_json" | python3 -c "import sys,json; print('|'.join(json.load(sys.stdin).get('failures', [])))")

  local base_pass base_fail base_skip base_expect base_failures
  base_pass=$(echo "$baseline" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pass',0))" 2>/dev/null || echo 0)
  base_fail=$(echo "$baseline" | python3 -c "import sys,json; print(json.load(sys.stdin).get('fail',0))" 2>/dev/null || echo 0)
  base_skip=$(echo "$baseline" | python3 -c "import sys,json; print(json.load(sys.stdin).get('skip',0))" 2>/dev/null || echo 0)
  base_expect=$(echo "$baseline" | python3 -c "import sys,json; print(json.load(sys.stdin).get('expect_calls',0))" 2>/dev/null || echo 0)
  base_failures=$(echo "$baseline" | python3 -c "import sys,json; print('|'.join(json.load(sys.stdin).get('failures',[])))" 2>/dev/null || echo "")

  local regression=0
  local flaky=0

  echo ""
  echo "=== 测试基线对比 ==="
  printf "%-20s %7s %7s %7s %7s\n" "" "通过" "失败" "跳过" "expect"
  printf "%-20s %7s %7s %7s %7s\n" "基线" "$base_pass" "$base_fail" "$base_skip" "$base_expect"
  printf "%-20s %7s %7s %7s %7s\n" "当前" "$curr_pass" "$curr_fail" "$curr_skip" "$curr_expect"

  # Diff
  local diff_pass=$((curr_pass - base_pass))
  local diff_fail=$((curr_fail - base_fail))
  local diff_skip=$((curr_skip - base_skip))
  local diff_expect=$((curr_expect - base_expect))

  if [ "$curr_fail" -gt "$base_fail" ]; then
    echo ""
    echo -e "${RED}❌ REGRESSION 检测: 失败数从 $base_fail 升到 $curr_fail${NC}"
    regression=1

    # 区分已知 vs 新 failure
    IFS='|' read -ra NEW_FAILS <<< "$curr_failures"
    IFS='|' read -ra BASE_FAILS <<< "$base_failures"
    for f in "${NEW_FAILS[@]}"; do
      local matched=0
      for b in "${BASE_FAILS[@]}"; do
        if [ "$f" = "$b" ]; then
          matched=1
          break
        fi
      done
      if [ "$matched" -eq 0 ]; then
        echo -e "${RED}   🆕 新失败: $f${NC}"
      else
        echo -e "${YELLOW}   🔄 已知失败 (flaky 候选): $f${NC}"
        flaky=1
      fi
    done
  elif [ "$curr_pass" -ge "$base_pass" ]; then
    echo -e "${GREEN}✅ PASS: 未检出回归${NC}"
  fi

  # 如果只有 flaky（无新 failure），允许通过
  if [ "$flaky" -eq 1 ] && [ "$regression" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  仅发现 flaky（已知 failure 重复出现）${NC}"
    return 0
  fi

  return $regression
}

case "${1:-}" in
  --save)
    do_save
    ;;
  --verify)
    do_verify
    ;;
  --show)
    do_show
    ;;
  *)
    echo "Usage: $0 --save | --verify | --show"
    exit 1
    ;;
esac

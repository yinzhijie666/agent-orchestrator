#!/bin/bash
# ==============================================================
# CodeGraph 能力矩阵生成器
#   - 自动从 `codegraph --help` 提取 CLI 命令列表
#   - 与 docs/CODEGRAPH-CAPABILITY-MATRIX.md 配合使用
#   - 输出: JSON 到 stdout, Markdown 到 stderr
#   - 用法: bash scripts/codegraph-capability-matrix.sh [output.json]
# ==============================================================
set -e

export PATH="$HOME/.bun/install/global/node_modules/.bin:$HOME/.bun/bin:$PATH"

OUTPUT_JSON="${1:-docs/CODEGRAPH-CAPABILITY-MATRIX.json}"
VERSION=$(codegraph --version 2>/dev/null | grep -oE 'v?[0-9]+\.[0-9]+\.[0-9]+' | head -1)
VERSION=${VERSION:-unknown}
GENERATED_AT=$(date -Iseconds)

CLI_COMMANDS=()
while IFS= read -r line; do
  CMD=$(echo "$line" | sed -E 's/^  ([a-z-]+).*/\1/' | tr -d ' ')
  if [ -n "$CMD" ] && [ "$CMD" != "options:" ] && [ "$CMD" != "help" ]; then
    CLI_COMMANDS+=("$CMD")
  fi
done < <(codegraph --help 2>/dev/null | grep -E "^  [a-z]" | grep -v "options:\|help \[command\]")

CLI_COUNT=${#CLI_COMMANDS[@]}

MCP_TOOLS=("codegraph_context:context" "codegraph_search:query" "codegraph_node:node" "codegraph_explore:explore" "codegraph_trace:trace")
MCP_COUNT=${#MCP_TOOLS[@]}

CLI_ONLY=0
for cmd in "${CLI_COMMANDS[@]}"; do
  IS_MCP=false
  for mcp_pair in "${MCP_TOOLS[@]}"; do
    MCP_NAME="${mcp_pair%%:*}"
    MCP_BASE="${mcp_pair#*:}"
    if [ "$cmd" = "$MCP_BASE" ]; then
      IS_MCP=true
      break
    fi
  done
  if [ "$IS_MCP" = false ]; then
    CLI_ONLY=$((CLI_ONLY+1))
  fi
done

MCP_EXCLUSIVE=0
for mcp_pair in "${MCP_TOOLS[@]}"; do
  MCP_NAME="${mcp_pair%%:*}"
  MCP_BASE="${mcp_pair#*:}"
  IS_CLI=false
  for cmd in "${CLI_COMMANDS[@]}"; do
    if [ "$cmd" = "$MCP_BASE" ]; then
      IS_CLI=true
      break
    fi
  done
  if [ "$IS_CLI" = false ]; then
    MCP_EXCLUSIVE=$((MCP_EXCLUSIVE+1))
  fi
done

JSON='{'
JSON+='"tool": "codegraph", '
JSON+='"version": "'"$VERSION"'", '
JSON+='"generated_at": "'"$GENERATED_AT"'", '
JSON+='"data_source": "codegraph --help (live binary output)", '
JSON+='"cli": {"count": '"$CLI_COUNT"', "commands": ['
FIRST=true
for cmd in "${CLI_COMMANDS[@]}"; do
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    JSON+=", "
  fi
  JSON+='"'"$cmd"'"'
done
JSON+='], "cli_only_count": '"$CLI_ONLY"'}, '
JSON+='"mcp": {"count": '"$MCP_COUNT"', "tools": ['
FIRST=true
for mcp_pair in "${MCP_TOOLS[@]}"; do
  MCP_NAME="${mcp_pair%%:*}"
  MCP_BASE="${mcp_pair#*:}"
  IS_CLI=false
  for cmd in "${CLI_COMMANDS[@]}"; do
    if [ "$cmd" = "$MCP_BASE" ]; then
      IS_CLI=true
      break
    fi
  done
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    JSON+=", "
  fi
  if [ "$IS_CLI" = true ]; then
    JSON+='{"name": "'"$MCP_NAME"'", "cli_alternative": "'"$MCP_BASE"'"}'
  else
    JSON+='{"name": "'"$MCP_NAME"'", "cli_alternative": null}'
  fi
done
JSON+=']}, '
JSON+='"gaps": {"mcp_exclusive_count": '"$MCP_EXCLUSIVE"', "total_capabilities": '"$((CLI_COUNT + MCP_EXCLUSIVE))"'}'
JSON+='}'

mkdir -p "$(dirname "$OUTPUT_JSON")"
echo "$JSON" > "$OUTPUT_JSON"
echo "✅ JSON 写入: $OUTPUT_JSON" >&2
echo "" >&2
echo "=== 摘要 ===" >&2
echo "CodeGraph version: $VERSION" >&2
echo "CLI 命令数: $CLI_COUNT" >&2
echo "MCP 工具数: $MCP_COUNT" >&2
echo "CLI-only 数: $CLI_ONLY" >&2
echo "MCP 独占数: $MCP_EXCLUSIVE" >&2
echo "总能力数: $((CLI_COUNT + MCP_EXCLUSIVE))" >&2
echo "" >&2
echo "=== CLI 命令列表 ===" >&2
for cmd in "${CLI_COMMANDS[@]}"; do
  echo "  - $cmd" >&2
done
echo "$JSON"

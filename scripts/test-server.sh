#!/bin/bash
# ==============================================================
# Test Server Manager — 自动端口分配 + 启动/停止
#   --start      启动测试服务器（自动选端口）
#   --stop       停止测试服务器
#   --check      检查服务器运行状态
#   --port N     指定起始端口（默认 18765）
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

export PATH="$HOME/.bun/install/global/node_modules/.bin:$HOME/.bun/bin:$PATH"

PID_FILE=".gstack/test-server.pid"
PORT_FILE=".gstack/test-server.port"
LOG_FILE=".gstack/test-server.log"

find_free_port() {
  local base=${1:-18765}
  local max_tries=100
  local i=0
  while [ $i -lt $max_tries ]; do
    if ! netstat -tln 2>/dev/null | grep -q ":$base "; then
      echo "$base"
      return 0
    fi
    base=$((base + 1))
    i=$((i + 1))
  done
  return 1
}

do_start() {
  local port="$1"
  if [ -z "$port" ]; then
    port=$(find_free_port) || {
      echo "❌ 无法找到空闲端口（已尝试 100 个）"
      exit 1
    }
  fi

  if [ -f "$PID_FILE" ]; then
    local old_pid
    old_pid=$(cat "$PID_FILE")
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "⚠️  服务器已在运行 (PID $old_pid, 端口 $(cat "$PORT_FILE" 2>/dev/null || echo '?'))"
      exit 0
    fi
    rm -f "$PID_FILE" "$PORT_FILE"
  fi

  export AGENT_ORCHESTRATOR_PORT="$port"
  nohup bun run server/index.js > "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  echo "$port" > "$PORT_FILE"

  # 等待 ready
  local waited=0
  while [ $waited -lt 50 ]; do
    if grep -q "AgentOrchestrator" "$LOG_FILE" 2>/dev/null; then
      echo "✅ 测试服务器已启动 (PID $pid, 端口 $port)"
      return 0
    fi
    sleep 0.2
    waited=$((waited + 1))
  done

  # 超时
  echo "❌ 服务器启动超时（>10s），检查日志: $LOG_FILE"
  kill "$pid" 2>/dev/null || true
  rm -f "$PID_FILE" "$PORT_FILE"
  exit 2
}

do_stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "⚠️  无服务器在运行（无 PID 文件）"
    return 0
  fi
  local pid
  pid=$(cat "$PID_FILE")
  if kill "$pid" 2>/dev/null; then
    echo "✅ 服务器已停止 (PID $pid)"
  else
    echo "⚠️  服务器进程不存在 (PID $pid)"
  fi
  rm -f "$PID_FILE" "$PORT_FILE"
}

do_check() {
  if [ ! -f "$PID_FILE" ]; then
    echo "❌ 服务器未运行"
    return 1
  fi
  local pid
  pid=$(cat "$PID_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    local port
    port=$(cat "$PORT_FILE" 2>/dev/null || echo "?")
    echo "✅ 服务器运行中 (PID $pid, 端口 $port)"
    return 0
  fi
  echo "❌ PID 文件存在但进程已死"
  rm -f "$PID_FILE" "$PORT_FILE"
  return 1
}

case "${1:-}" in
  --start)
    shift
    port=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --port) port="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    do_start "$port"
    ;;
  --stop)
    do_stop
    ;;
  --check)
    do_check
    ;;
  *)
    echo "Usage: $0 --start [--port N] | --stop | --check"
    exit 1
    ;;
esac

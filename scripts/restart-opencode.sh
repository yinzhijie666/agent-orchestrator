#!/bin/bash
# ==============================================================
# OpenCode 重启 + 更新脚本
#   - 停止所有 OpenCode 和 CodeGraph 服务
#   - 更新 OpenCode 和 CodeGraph 到最新版本
#   - 重启服务
#   - 验证服务状态
# ==============================================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ==============================================================
# 步骤 1: 停止服务
# ==============================================================
echo ""
echo "=== 步骤 1: 停止 OpenCode 服务 ==="

# 停止 OpenCode 主服务
if pgrep -f "opencode serve" > /dev/null; then
    log_info "停止 OpenCode 主服务..."
    pkill -f "opencode serve" || true
    sleep 2
else
    log_info "OpenCode 主服务未运行"
fi

# 停止 CodeGraph MCP 服务
if pgrep -f "codegraph serve" > /dev/null; then
    log_info "停止 CodeGraph MCP 服务..."
    pkill -f "codegraph serve" || true
    sleep 2
else
    log_info "CodeGraph MCP 服务未运行"
fi

# 验证进程已停止
REMAINING=$(ps aux | grep -E "opencode|codegraph" | grep -v grep | wc -l)
if [ "$REMAINING" -gt 0 ]; then
    log_warn "仍有 $REMAINING 个相关进程运行:"
    ps aux | grep -E "opencode|codegraph" | grep -v grep
    log_info "强制停止..."
    pkill -9 -f "opencode serve" 2>/dev/null || true
    pkill -9 -f "codegraph serve" 2>/dev/null || true
    sleep 1
fi

log_info "所有服务已停止"

# ==============================================================
# 步骤 2: 更新 OpenCode
# ==============================================================
echo ""
echo "=== 步骤 2: 更新 OpenCode ==="

OPENCODE_BEFORE=$(opencode --version 2>/dev/null || echo "unknown")
log_info "当前版本: $OPENCODE_BEFORE"

log_info "更新 OpenCode..."
if npm update -g @opencode-ai/opencode 2>/dev/null; then
    OPENCODE_AFTER=$(opencode --version 2>/dev/null || echo "unknown")
    if [ "$OPENCODE_BEFORE" != "$OPENCODE_AFTER" ]; then
        log_info "✅ OpenCode 已更新: $OPENCODE_BEFORE -> $OPENCODE_AFTER"
    else
        log_info "✅ OpenCode 已是最新版本: $OPENCODE_AFTER"
    fi
else
    log_warn "⚠️ OpenCode 更新失败，使用当前版本继续"
fi

# ==============================================================
# 步骤 3: 更新 CodeGraph
# ==============================================================
echo ""
echo "=== 步骤 3: 更新 CodeGraph ==="

CODEGRAPH_BEFORE=$(codegraph --version 2>/dev/null || echo "unknown")
log_info "当前版本: $CODEGRAPH_BEFORE"

log_info "更新 CodeGraph..."
if bun update -g @colbymchenry/codegraph 2>/dev/null; then
    CODEGRAPH_AFTER=$(codegraph --version 2>/dev/null || echo "unknown")
    if [ "$CODEGRAPH_BEFORE" != "$CODEGRAPH_AFTER" ]; then
        log_info "✅ CodeGraph 已更新: $CODEGRAPH_BEFORE -> $CODEGRAPH_AFTER"
    else
        log_info "✅ CodeGraph 已是最新版本: $CODEGRAPH_AFTER"
    fi
else
    log_warn "⚠️ CodeGraph 更新失败，使用当前版本继续"
fi

# ==============================================================
# 步骤 4: 重启服务
# ==============================================================
echo ""
echo "=== 步骤 4: 重启服务 ==="

# 启动 OpenCode 主服务
log_info "启动 OpenCode 主服务 (端口 4096)..."
nohup opencode serve --hostname 0.0.0.0 --port 4096 > /tmp/opencode.log 2>&1 &
OPENCODE_PID=$!
log_info "OpenCode PID: $OPENCODE_PID"

# 等待 OpenCode 启动
sleep 3

# 检查 OpenCode 是否启动成功
if kill -0 $OPENCODE_PID 2>/dev/null; then
    log_info "✅ OpenCode 主服务已启动"
else
    log_error "❌ OpenCode 主服务启动失败"
    log_error "查看日志: cat /tmp/opencode.log"
    exit 1
fi

# 启动 CodeGraph MCP 服务
log_info "启动 CodeGraph MCP 服务..."
nohup codegraph serve --mcp > /tmp/codegraph.log 2>&1 &
CODEGRAPH_PID=$!
log_info "CodeGraph PID: $CODEGRAPH_PID"

# 等待 CodeGraph 启动
sleep 2

# 检查 CodeGraph 是否启动成功
if kill -0 $CODEGRAPH_PID 2>/dev/null; then
    log_info "✅ CodeGraph MCP 服务已启动"
else
    log_warn "⚠️ CodeGraph MCP 服务启动失败（非致命）"
fi

# ==============================================================
# 步骤 5: 验证服务状态
# ==============================================================
echo ""
echo "=== 步骤 5: 验证服务状态 ==="

# 检查进程
log_info "运行中的服务:"
ps aux | grep -E "opencode|codegraph" | grep -v grep | awk '{print "  PID " $2 ": " $11 " " $12 " " $13}'

# 检查端口
log_info "端口监听状态:"
if ss -tlnp | grep 4096 > /dev/null 2>&1; then
    log_info "✅ 端口 4096 已监听"
else
    log_warn "⚠️ 端口 4096 未监听（可能需要更多时间启动）"
fi

# 健康检查
log_info "OpenCode 健康检查:"
HEALTH_RESULT=$(curl -s http://localhost:4096/health 2>/dev/null || echo "failed")
if echo "$HEALTH_RESULT" | grep -q "ok\|healthy\|success"; then
    log_info "✅ OpenCode 健康检查通过"
else
    log_warn "⚠️ 健康检查返回: $HEALTH_RESULT"
fi

# ==============================================================
# 步骤 6: 验证 agent-orchestrator
# ==============================================================
echo ""
echo "=== 步骤 6: 验证 agent-orchestrator ==="

if [ -d "$HOME/agent-orchestrator" ]; then
    cd "$HOME/agent-orchestrator"

    # 运行 verify.sh
    if [ -f "scripts/workflow-preflight-check.sh" ]; then
        log_info "运行前置检查..."
        bash scripts/workflow-preflight-check.sh 2>&1 | tail -10
    fi

    # 运行快速测试
    log_info "运行单元测试..."
    timeout 60 bun test $(ls tests/*.test.js | grep -v real-api | grep -v skills) 2>&1 | tail -5
else
    log_warn "agent-orchestrator 目录不存在"
fi

# ==============================================================
# 完成
# ==============================================================
echo ""
echo "=== 重启完成 ==="
echo ""
echo "服务状态:"
echo "  - OpenCode: http://localhost:4096"
echo "  - OpenCode 版本: $(opencode --version 2>/dev/null || echo 'unknown')"
echo "  - CodeGraph 版本: $(codegraph --version 2>/dev/null || echo 'unknown')"
echo ""
echo "日志文件:"
echo "  - OpenCode: /tmp/opencode.log"
echo "  - CodeGraph: /tmp/codegraph.log"
echo ""
echo "常用命令:"
echo "  - 查看日志: tail -f /tmp/opencode.log"
echo "  - 检查状态: curl http://localhost:4096/health"
echo "  - 停止服务: pkill -f 'opencode serve'"
echo ""

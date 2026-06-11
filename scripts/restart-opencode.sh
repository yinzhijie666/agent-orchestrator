#!/bin/bash
# ==============================================================
# OpenCode 安全重启脚本
# 依赖 systemd Restart=always 自动重启
# ==============================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ==============================================================
# 前置检查
# ==============================================================
if ! sudo systemctl is-active --quiet opencode; then
    log_error "opencode 服务未运行"
    exit 1
fi

MAIN_PID=$(sudo systemctl show --property=MainPID --value opencode)
log_info "OpenCode 主进程 PID: $MAIN_PID"
log_info "当前 shell 位于 opencode cgroup 中，脚本将在重启前退出"

# ==============================================================
# 警告 + 3 秒倒计时
# ==============================================================
echo ""
log_warn "即将重启 OpenCode 服务"
log_warn "当前 CLI 会话将在约 6 秒后断开，请保存工作"
echo ""
for i in 3 2 1; do
    echo -ne "   ${i}...\r"
    sleep 1
done
echo ""

# ==============================================================
# 步骤 1: 停止 CodeGraph（独立 systemd 服务）
# ==============================================================
if sudo systemctl is-active --quiet codegraph 2>/dev/null; then
    log_info "优雅停止 codegraph..."
    sudo systemctl stop codegraph
    sleep 2
    if sudo systemctl is-active --quiet codegraph 2>/dev/null; then
        log_warn "codegraph 未响应 SIGTERM，强制停止..."
        sudo systemctl kill -s KILL codegraph 2>/dev/null || true
        sleep 1
    fi
    log_info "✅ codegraph 已停止"
else
    log_info "codegraph 未运行，跳过"
fi

# ==============================================================
# 步骤 2: 延迟重启 OpenCode
# ==============================================================
echo ""
echo "--- 重启 OpenCode ---"

log_info "将在 3 秒后发送 SIGTERM..."
echo ""

# 后台进程与脚本在不同 session 但仍在同一 cgroup
# 当 systemd 发送 SIGTERM 到 cgroup 时，此进程也会被杀
# 但 D-Bus 消息已在此之前发送给 systemd，重启不受影响
setsid bash -c '
    sleep 3
    sudo systemctl kill -s TERM opencode
' & disown

echo ""
log_info "✅ 重启指令已提交"
log_info ""
log_info "流程:"
log_info "  1. 3s → systemd 向 cgroup 发 SIGTERM"
log_info "  2. 旧进程（含当前会话）终止"
log_info "  3. systemd RestartSec=10 → 自动拉起新进程"
echo ""
log_info "查看状态: sudo systemctl status opencode"
log_info "查看日志: sudo journalctl -u opencode -n 20 --no-pager"

sleep 1
echo ""
log_info "脚本将在 2 秒后退出..."
sleep 2

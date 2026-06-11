#!/bin/bash
# ==============================================================
# cgroup-tree — 进程 cgroup 关系诊断工具
#   - 显示进程的 cgroup 路径
#   - 列出同 cgroup 所有进程（即会被一起 kill 的所有进程）
#   - 树形展示进程父子关系
#
# 用法:
#   bash cgroup-tree.sh <PID>
#   bash cgroup-tree.sh <service-name>   (systemd 服务名)
#   bash cgroup-tree.sh $$               (当前 shell)
# ==============================================================

set -euo pipefail

CGROUP_SYSFS="/sys/fs/cgroup"

# 取 cgroup 路径（从 /proc/PID/cgroup，取 systemd 管理的 path）
get_cgroup_path() {
    local pid=$1
    local raw
    raw=$(grep -oP '0::/\K.*' /proc/"$pid"/cgroup 2>/dev/null || true)
    if [ -z "$raw" ]; then
        # fallback: 取包含 system.slice 的行
        raw=$(grep -oP '/system\.slice/[^:]*' /proc/"$pid"/cgroup 2>/dev/null || true)
    fi
    echo "$raw"
}

# 列出同 cgroup 的所有 PID
list_cgroup_pids() {
    local cgroup_path=$1
    local procs_file="$CGROUP_SYSFS/$cgroup_path/cgroup.procs"
    if [ -f "$procs_file" ]; then
        cat "$procs_file"
    fi
}

# 解析 service name → MainPID
service_to_pid() {
    local svc=$1
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
        systemctl show --property=MainPID --value "$svc" 2>/dev/null || echo ""
    fi
}

# 打印进程名
get_comm() {
    cat "/proc/$1/comm" 2>/dev/null || echo "?"
}

# 打印进程 cmdline（截断）
get_cmdline() {
    local cmd
    cmd=$(tr '\0' ' ' < "/proc/$1/cmdline" 2>/dev/null || echo "?")
    echo "${cmd:0:80}" 2>/dev/null || true
}

# ==============================================================

# 解析参数
input="${1:-}"
if [ -z "$input" ]; then
    echo "用法: $0 <PID|service-name>"
    echo "示例:"
    echo "  $0 1234              # 按 PID"
    echo "  $0 opencode           # 按 systemd 服务名"
    echo "  $0 \$\$               # 当前进程"
    exit 1
fi

# 如果输入非数字，尝试解析为 service name
if ! [[ "$input" =~ ^[0-9]+$ ]]; then
    pid=$(service_to_pid "$input")
    if [ -z "$pid" ] || [ "$pid" -eq 0 ]; then
        echo "错误: 服务 '$input' 未运行或未找到"
        exit 1
    fi
    service_name="$input"
else
    pid=$input
    service_name=""
fi

# 验证进程存在
if [ ! -d "/proc/$pid" ]; then
    echo "错误: 进程 $pid 不存在"
    exit 1
fi

# 获取 cgroup 路径
cgroup_path=$(get_cgroup_path "$pid")
if [ -z "$cgroup_path" ]; then
    echo "错误: 无法获取进程 $pid 的 cgroup 信息"
    exit 1
fi

echo "========================================"
echo "cgroup 诊断: PID $pid"
[ -n "$service_name" ] && echo "服务: $service_name"
echo "进程: $(get_comm $pid)"
echo "cmd:  $(get_cmdline $pid)"
echo "========================================"
echo ""

echo "cgroup 路径: /$cgroup_path"
echo ""

# 列出同 cgroup 的进程
echo "同 cgroup 进程列表 (会被一起 kill):"
echo "----------------------------------------"
total=0
while IFS= read -r cg_pid; do
    [ -z "$cg_pid" ] && continue
    comm=$(get_comm "$cg_pid")
    cmd=$(get_cmdline "$cg_pid")
    printf "  PID %-6s %-20s %s\n" "$cg_pid" "$comm" "$cmd"
    total=$((total + 1))
done < <(list_cgroup_pids "$cgroup_path")
echo "----------------------------------------"
echo "共 $total 个进程"
echo ""

# 进程树（如果 pstree 可用）
if command -v pstree &>/dev/null; then
    echo "进程树 (pstree -p $pid):"
    pstree -p "$pid" 2>/dev/null || echo "  (无法展开)"
    echo ""
fi

# systemd 单位信息（如果在 systemd cgroup 中）
unit_name=$(echo "$cgroup_path" | grep -oP 'system\.slice/[^/]+' | head -1 || true)
if [ -n "$unit_name" ]; then
    unit="${unit_name#system.slice/}"
    echo "systemd 单元: $unit"
    if command -v systemctl &>/dev/null; then
        state=$(systemctl is-active "$unit" 2>/dev/null || echo "unknown")
        echo "服务状态: $state"
        main_pid=$(systemctl show --property=MainPID --value "$unit" 2>/dev/null || echo "?")
        echo "MainPID: $main_pid"
        kill_mode=$(systemctl show --property=KillMode --value "$unit" 2>/dev/null || echo "?")
        echo "KillMode: $kill_mode"
        restart=$(systemctl show --property=Restart --value "$unit" 2>/dev/null || echo "?")
        echo "Restart: $restart"
    fi
fi

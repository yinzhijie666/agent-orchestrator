# CodeGraph 16 CLI 命令能力矩阵

> **本表与 [scripts/codegraph-capability-matrix.sh](scripts/codegraph-capability-matrix.sh) 配合使用**。脚本自动生成 JSON 格式 (`docs/CODEGRAPH-CAPABILITY-MATRIX.json`),Markdown 表格为人工可读参考。
>
> **数据源**:`codegraph --help` 实际输出(2026-06-04,v0.9.7)。**如本表与脚本输出冲突,以脚本为准**。
>
> **不变量**:CLI 命令集 16 个、MCP 工具 5 个,跨小版本通常不变;但 v1.0 之前可能微调。

## 一、CLI 命令(16 个,全部走 `codegraph <cmd>`)

| #  | CLI 命令             | 用途           | 示例                                              | 状态        |
| -- | -------------------- | -------------- | ------------------------------------------------- | ----------- |
| 1  | `codegraph init`     | 初始化索引     | `codegraph init -i`                                | ✅ 可用     |
| 2  | `codegraph uninit`   | 移除项目索引   | `codegraph uninit`                                 | ✅ 可用     |
| 3  | `codegraph index`    | 重建索引       | `codegraph index`                                  | ✅ 可用     |
| 4  | `codegraph sync`     | 增量同步       | `codegraph sync`                                   | ✅ 可用     |
| 5  | `codegraph status`   | 索引状态       | `codegraph status`                                 | ✅ 可用     |
| 6  | `codegraph query`    | 符号搜索       | `codegraph query BaseModelClient`                  | ✅ 可用     |
| 7  | `codegraph files`    | 文件结构       | `codegraph files`                                  | ✅ 可用     |
| 8  | `codegraph context`  | 任务上下文     | `codegraph context "重构 X"`                       | ✅ 可用     |
| 9  | `codegraph serve`    | 启动 MCP server | `codegraph serve`                                 | ✅ 可用     |
| 10 | `codegraph unlock`   | 移除 stale lock | `codegraph unlock`                                | ✅ 可用     |
| 11 | `codegraph callers`  | 谁调用了我     | `codegraph callers BaseModelClient`                | ✅ 可用     |
| 12 | `codegraph callees`  | 我调用了谁     | `codegraph callees auth.login`                     | ✅ 可用     |
| 13 | `codegraph impact`   | 改动影响       | `codegraph impact auth.login`                      | ✅ 可用     |
| 14 | `codegraph affected` | 受影响测试     | `codegraph affected src/auth.js`                   | ✅ 可用     |
| 15 | `codegraph install`  | 安装 MCP       | `codegraph install`                                | ✅ 可用     |
| 16 | `codegraph uninstall`| 卸载 MCP       | `codegraph uninstall`                              | ✅ 可用     |

## 二、MCP 工具(5 个,通过 MCP server `codegraph serve` 暴露)

| #  | MCP 工具名             | 对应 CLI           | 用途              |
| -- | ---------------------- | ------------------ | ----------------- |
| 1  | `codegraph_context`    | `context`          | 任务上下文(MCP 版) |
| 2  | `codegraph_search`     | `query`            | 符号搜索(MCP 版)  |
| 3  | `codegraph_node`       | (无 CLI 替代)      | 单符号详情        |
| 4  | `codegraph_explore`    | (无 CLI 替代)      | 多符号源探索      |
| 5  | `codegraph_trace`      | (无 CLI 替代)      | 调用链追踪        |

## 三、CLI-only 命令(11 个,**不能通过 MCP 调用**)

以下命令**只能**通过 CLI:

`init` `uninit` `index` `sync` `status` `files` `serve` `unlock` `callers` `callees` `impact` `affected` `install` `uninstall`

## 四、MCP-only 能力(3 个,**CLI 不支持**)

`codegraph_node` `codegraph_explore` `codegraph_trace` 在 `codegraph --help` 中**不出现**,只能通过 MCP server 调用。

## 五、能力差距与替代方案

| MCP 工具          | MCP 不可用时 CLI 替代                                       |
| ----------------- | ----------------------------------------------------------- |
| `codegraph_context` | `codegraph context "<task>"`                                |
| `codegraph_search`  | `codegraph query "<symbol>"`                                |
| `codegraph_node`    | `codegraph query "<symbol>" --kind <kind>` + 读 context 输出 |
| `codegraph_explore` | `codegraph query "<sym1>,<sym2>"` + 多次 `codegraph context` |
| `codegraph_trace`   | 多次 `codegraph callers`/`callees` 拼链                      |

## 六、PATH 注意事项

`codegraph` 不在默认 PATH,使用前需:

```bash
export PATH="$HOME/.bun/install/global/node_modules/.bin:$HOME/.bun/bin:$PATH"
```

或显式调用:

```bash
~/.bun/install/global/node_modules/.bin/codegraph <cmd>
```

## 七、版本历史

| 日期       | version | CLI 数 | MCP 数 | 备注                                       |
| ---------- | ------- | ------ | ------ | ------------------------------------------ |
| 2026-06-04 | 0.9.7   | 16     | 5      | 当前版本,MCP 独占 node/explore/trace       |

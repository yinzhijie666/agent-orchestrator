# Agent-Orchestrator 入职指南

> 自动生成于 2026-06-05，基于知识图谱分析

## 项目概述

- **名称**: agent-orchestrator
- **语言**: JavaScript, Markdown, JSON, Shell
- **框架**: Express.js, SQLite, WebSocket
- **描述**: A multi-agent orchestration system for OpenCode that coordinates planning, execution, and verification through specialized agents

## 架构层次

### 1. Plugin Entry Layer (3 个节点)
插件入口层，负责初始化和注册工具。

**关键文件:**
- `index.js` - 主插件入口，注册 4 个工具（agent, agent_status, agent_checkpoint, agent_execute_skills）
- `opencode.json` - OpenCode 插件配置

### 2. API Layer (5 个节点)
REST API 层，提供 HTTP 接口。

**关键文件:**
- `server/api/plan.js` - 计划管理 API
- `server/api/checkpoint.js` - 检查点 API
- `server/api/thread.js` - 线程管理 API
- `server/api/status.js` - 状态查询 API
- `server/api/internal-event.js` - 内部事件 API

### 3. Core Orchestration Layer (5 个节点)
核心编排层，负责任务路由和调度。

**关键文件:**
- `server/lib/plan-orchestrator.js` - 计划编排器
- `server/lib/auto-dispatcher.js` - 自动调度器（D1/D2 策略）
- `server/lib/auto-executor.js` - 技能自动执行器
- `server/lib/subagent-runner.js` - 子代理运行器
- `server/lib/milestone-manager.js` - 里程碑管理器

### 4. Model Layer (3 个节点)
模型客户端层，实现三层模型路由。

**关键文件:**
- `server/lib/model-clients/kimi-client.js` - Kimi K2.6 客户端（规划层）
- `server/lib/model-clients/deepseek-client.js` - DeepSeek V4 客户端（执行层）
- `server/lib/model-clients/zen-client.js` - OpenCode Zen DeepSeek V4 Flash Free 客户端（查询层）

### 5. Infrastructure Layer (4 个节点)
基础设施层，提供数据库、事件、WebSocket 支持。

**关键文件:**
- `server/lib/db.js` - SQLite 数据库操作
- `server/lib/events.js` - 事件发射器
- `server/websocket/broadcaster.js` - WebSocket 广播器
- `server/config/default.json` - 默认配置

### 6. Documentation Layer (4 个节点)
文档层，包含项目文档和配置。

**关键文件:**
- `README.md` - 项目说明文档
- `CLAUDE.md` - 项目规则和指令
- `docs/ARCHITECTURE.md` - 架构文档
- `docs/CHECKPOINT-SYSTEM.md` - 检查点系统文档

## 核心概念

### 三层模型路由
- **Kimi K2.6**: 规划层，负责任务分析和计划生成
- **DeepSeek V4**: 执行层，负责代码实现和任务执行
- **OpenCode Zen**: 查询层，负责只读查询和信息检索

### 自动调度策略
- **D1**: 直接 LLM API 调用（默认）
- **D2**: 长连接 opencode server（可选，当前禁用）

### 技能自动执行
- **P0_critical**: 必须执行，失败则停止
- **P1_important**: 顺序执行，失败则跳过
- **P2_nice_to_have**: 可选执行

## 引导巡览

1. **Project Overview** — 文档和配置
2. **Plugin Entry Point** — index.js
3. **HTTP Server** — server/index.js
4. **API Layer** — REST 端点
5. **Core Orchestration** — 计划和调度
6. **Model Clients** — 三层 LLM 架构
7. **Infrastructure** — 数据库、事件和 WebSocket
8. **Checkpoint System** — 里程碑质量门

## 复杂度热点

### [complex] AgentOrchestratorPlugin
主插件入口，包含所有工具定义和业务逻辑（702 行）。建议拆分为多个模块。

### [complex] AutoDispatcher
自动调度器，实现 D1/D2 策略。包含健康检查、重启逻辑、故障转移。

### [complex] KimiClient
Kimi 模型客户端，包含计划生成、任务分析、检查点审查等复杂逻辑。

### [high] DB
数据库操作类，包含 8 个表的 CRUD 操作和迁移逻辑。

### [high] PlanOrchestrator
计划编排器，负责计划生成、持久化、验证。

## 快速开始

```bash
# 1. 克隆项目
cd ~/agent-orchestrator

# 2. 设置 API Keys
export OPENCODE_API_KEY=sk-...
export DEEPSEEK_API_KEY=sk-...

# 3. 初始化数据库
bun run init-db

# 4. 启动服务器
bun run start

# 5. 运行测试
bun test
```

## 相关文档

- [README.md](../README.md) - 项目说明
- [CLAUDE.md](../CLAUDE.md) - 项目规则
- [ARCHITECTURE.md](ARCHITECTURE.md) - 架构文档
- [CHECKPOINT-SYSTEM.md](CHECKPOINT-SYSTEM.md) - 检查点系统

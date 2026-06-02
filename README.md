# Agent Orchestrator

> Three-layer agent orchestration: **Kimi K2.6** plans, **DeepSeek V4 Flash** builds, **MiniMax M3** queries.

## Quick Start

```bash
# 1. Clone / enter directory
cd ~/agent-orchestrator

# 2. Set API keys (or edit .env)
export KIMI_API_KEY=sk-...       # Moonshot API Key (OpenCode GO套餐)
export DEEPSEEK_API_KEY=sk-...   # DeepSeek API Key
export MINIMAX_API_KEY=sk-...    # MiniMax API Key

# 3. Initialize database
bun run init-db

# 4. Start coordinator server
bun run start

# 5. Open dashboard
open http://127.0.0.1:8765/dashboard
```

## Model Configuration

| Model | Provider | Endpoint | Status |
|-------|----------|----------|--------|
| **Kimi K2.6** | Moonshot | `https://api.moonshot.cn/v1` | ⏳ Waiting for API Key verification |
| **DeepSeek V4 Flash** | DeepSeek | `https://api.deepseek.com/v1` | ✅ Connected (2 models) |
| **MiniMax M3** | MiniMax | `https://api.minimax.chat/v1` | ✅ Connected (8 models) |

### Kimi Configuration (OpenCode GO)

Kimi K2.6 is accessed through the **OpenCode GO** package:

```bash
# OpenCode GO uses a single API key for all models
export OPENCODE_API_KEY=sk-...
```

**Provider Details:**
- **Endpoint**: `https://opencode.ai/zen/go/v1`
- **Model ID**: `kimi-k2.6`
- **Context Window**: 262,144 tokens
- **Features**: text, image, video, reasoning, tool calling
- **Cost**: $0.95/1M input tokens, $4.00/1M output tokens

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   OpenCode Environment                       │
│                     agent-orchestrator                         │
│                     (index.js plugin)                          │
└───────────────────────┬──────────────────────────────────────┘
                        │ WebSocket + REST
┌───────────────────────▼──────────────────────────────────────┐
│              Coordinator Server (Bun + SQLite)                 │
│                      Port 8765                                   │
│                                                                │
│  REST API:        WebSocket:         Dashboard:                │
│  /api/plans       Real-time events   /dashboard               │
│  /api/checkpoints Broadcast          (Live monitor)           │
│  /api/threads     Subscriptions                                │
│  /api/status                                                 │
└───────────────────────┬──────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    Kimi K2.6   DeepSeek V4    MiniMax M3
    (Planning)  (Execution)    (Query)
```

## Features

- **Three-layer routing**: Kimi → DeepSeek → MiniMax based on task type
- **Milestone checkpoints**: Every 4 plan items, Kimi reviews before continuing
- **Real-time dashboard**: WebSocket-powered live monitoring
- **OpenCode integration**: Native plugin with 5 tools + 3 hooks
- **SQLite state**: Zero external dependencies

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/plans` | Create plan via Kimi |
| `GET` | `/api/plans/:id` | Get plan with items |
| `PATCH` | `/api/plans/:id/items/:idx` | Update item status |
| `POST` | `/api/checkpoints` | Create milestone |
| `PATCH` | `/api/checkpoints/:id/verify` | Kimi verifies |
| `GET` | `/api/threads/:id` | Get conversation |
| `GET` | `/api/status` | Server health |

## Plugin Tools

| Tool | Layer | Purpose |
|------|-------|---------|
| `agent_plan` | Kimi | Generate structured plans |
| `agent_execute` | DeepSeek | Execute plan items |
| `agent_query` | MiniMax | Read-only information retrieval |
| `agent_status` | - | Get orchestration status |
| `agent_checkpoint` | Kimi | Create/verify milestones |

## Environment Variables

```bash
KIMI_API_KEY=            # Moonshot API Key (for OpenCode GO package)
DEEPSEEK_API_KEY=        # DeepSeek API Key
MINIMAX_API_KEY=         # MiniMax API Key
AGENT_ORCHESTRATOR_PORT=8765      # Optional
AGENT_ORCHESTRATOR_DB_PATH=       # Optional
```

## Development

```bash
bun run dev      # Watch mode
bun test         # Run tests
```

## Testing Model Connectivity

```bash
# Test all models
bun run test:models

# Expected output:
# ✅ DEEPSEEK: Connected (2 models)
# ✅ MINIMAX: Connected (8 models)
# ✅ KIMI: Connected (N models)  ← Requires valid API key
```

## License

MIT
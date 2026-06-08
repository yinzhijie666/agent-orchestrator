# Agent Orchestrator

> Three-layer agent orchestration: **Kimi K2.6** plans, **DeepSeek V4 Flash** builds, **OpenCode Zen** queries.

## Quick Start

```bash
# 1. Clone / enter directory
cd ~/agent-orchestrator

# 2. Set API keys (or edit .env)
export KIMI_API_KEY=sk-...       # Moonshot API Key (OpenCode GO套餐)
export DEEPSEEK_API_KEY=sk-...   # DeepSeek API Key
export OPENCODE_API_KEY=sk-...   # OpenCode API Key (for Kimi + OpenCode Zen)

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
| **Kimi K2.6** | OpenCode GO | `https://opencode.ai/zen/go/v1` | ✅ Connected |
| **DeepSeek V4 Flash** | DeepSeek | `https://api.deepseek.com/v1` | ✅ Connected |
| **DeepSeek V4 Flash Free** | OpenCode Zen | `https://opencode.ai/zen/v1` | ✅ Connected |

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
    Kimi K2.6   DeepSeek V4    OpenCode Zen
    (Planning)  (Execution)    (Query)
```

## Features

- **Three-layer routing**: Kimi → DeepSeek → OpenCode Zen based on task type
- **Milestone checkpoints**: Every 4 plan items, Kimi reviews before continuing
- **Real-time dashboard**: WebSocket-powered live monitoring
- **OpenCode integration**: Native plugin with 4 tools + 1 hook
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
| `agent` | Router | Auto-route every user request. Kimi decides plan mode (analysis) or build mode (DeepSeek/Zen execute). |
| `agent_execute_skills` | Parser | Extract prioritized P0/P1/P2 skills from latest plan and **auto-dispatch** subagent via AutoDispatcher (D1: LLM API / D2: opencode server). |
| `agent_status` | - | Get orchestration status, plan counts, agent availability. |
| `agent_checkpoint` | Kimi | Create/verify milestone checkpoints (every 4 completed items). |

## Environment Variables

```bash
KIMI_API_KEY=            # Moonshot API Key (for OpenCode GO package)
DEEPSEEK_API_KEY=        # DeepSeek API Key
MINIMAX_API_KEY=         # MiniMax API Key (legacy, now uses OPENCODE_API_KEY for Zen)
AGENT_ORCHESTRATOR_PORT=8765      # Optional
AGENT_ORCHESTRATOR_DB_PATH=       # Optional
AUTO_EXEC_SKILLS=true    # Enable auto-execute-skills feature (default: true)
AUTO_EXEC_DISPATCH=false # Disable AutoDispatcher auto-dispatch (default: enabled)
AUTO_EXEC_MODEL=cheap    # Subagent model: cheap|deepseek|opencode-zen (default: cheap)
```

## Auto-Skill-Execution (L3)

`agent_execute_skills` automatically dispatches a subagent to execute the
prioritized skill list (`P0_critical` → `P1_important` → `P2_nice_to_have`).
The dispatch uses **AutoDispatcher** with two paths:

- **D1 (default, active)**: `SubagentRunner` calls a LLM API directly via
  `BaseModelClient` (DeepSeek → OpenCode Zen fallback chain). Bypasses `opencode run`
  to avoid the `Session not found` bug in opencode 1.15.13.
- **D2 (preferred, monitoring)**: `OpencodeServer` starts a long-lived
  `opencode serve --pure` process for health/observability. Currently a no-op
  for actual dispatch (until upstream fixes `opencode run --attach`); the
  dispatcher falls back to D1 transparently.

The dispatcher is started automatically when the plugin loads and is stopped
on plugin dispose. Configure via `server/config/default.json` → `auto_exec.dispatcher`.

**Disable auto-dispatch** (for tests or manual control):
```bash
AUTO_EXEC_DISPATCH=false bun run dev
```

## Development

```bash
bun run dev          # Watch mode
bun test             # Run unit tests (58 tests, ~5s)
bun test tests/e2e/  # Run E2E tests (requires API key for live LLM dispatch)
```

## Testing Model Connectivity

```bash
# Test all models
bun run test:models

# Expected output:
# ✅ DEEPSEEK: Connected (2 models)
# ✅ ZEN: Connected (1 model)
# ✅ KIMI: Connected (N models)  ← Requires valid API key
```

## Health Check

Verify agent-orchestrator is loaded, running, and all subsystems healthy.

```bash
# Run full system audit (includes Phase 8 agent-orchestrator checks)
bash ~/.config/opencode/verify.sh
```

**What Phase 8 checks (9 items):**

| #   | Check                               | What it catches                                                       |
| --- | ----------------------------------- | --------------------------------------------------------------------- |
| 8.1 | Plugin source file exists           | Missing `index.js`                                                      |
| 8.2 | Plugin export signature valid       | "Plugin export is not a function" errors (e.g., gstack noop.ts class) |
| 8.3 | All 4 tools enabled                 | `opencode.json` missing `agent`/`agent_status`/etc.                         |
| 8.4 | Plugin registered in opencode.jsonc | `plugin[]` array not pointing to `~/agent-orchestrator`                   |
| 8.5 | DB schema has 7 tables              | DB init failure / schema drift                                        |
| 8.6 | Main opencode listening on :4096    | OpenCode serve not running                                            |
| 8.7 | Subprocess budget ≤ 3               | Leaked D2 servers / MCP zombies (R1/R2 fix effectiveness)             |
| 8.8 | D2 dispatcher HTTP 401 (if running) | AutoDispatcher.start() failed                                         |
| 8.9 | 0 plugin errors in 24h logs         | Silent plugin load failures                                           |

**Exit codes:**
- `exit 0` — All Golden 28 + Phase 8 checks pass
- `exit 1` — ≥ 1 check failed; output shows fix hints

**When to run:**
- After plugin version bump
- After OpenCode upgrade
- After system reboot (verify plugins re-loaded cleanly)
- Before reporting agent-orchestrator bugs (rule out plugin load issues first)

**Troubleshooting common failures:**

| Failure                            | Likely cause                          | Fix                                                                |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| 8.1 plugin source missing          | `~/agent-orchestrator` not cloned     | `git clone git@github.com:yinzhijie666/agent-orchestrator.git`       |
| 8.2 plugin export invalid          | `index.js` syntax error               | `bun test` to reproduce                                            |
| 8.4 plugin not registered          | `opencode.jsonc` out of sync          | Add `"agent-orchestrator@~/agent-orchestrator"` to `plugin[]`         |
| 8.5 DB schema < 7 tables           | DB init failure or partial migration  | Delete `server/state/db.sqlite`; restart OpenCode                  |
| 8.6 main opencode not listening    | OpenCode serve crashed                | `opencode serve` (background)                                      |
| 8.7 subprocess budget > 3          | Leaked D2 server                     | `pkill -f 'opencode serve --port 14[0-9]+ --hostname 127.0.0.1 --pure'` |
| 8.8 D2 dispatcher unhealthy        | AutoDispatcher.start() failed         | Check plugin logs; restart OpenCode                                |
| 8.9 plugin errors in 24h           | Silent load failure                   | `find ~/.local/share/opencode/log -name "*.log" -mtime -1 \| xargs grep agent-orch` |

**Related:**
- `~/.config/opencode/verify.sh` — runs Phase 8 as part of full audit
- `~/.config/opencode/.gstack/audit-reports/opencode-env-audit-2026-06-02-full.md` — Golden 28 reference
- `agent-orchestrator` commit `3cd4c42` — R1/R2 fix (dispatcher lifecycle + signal cleanup)
- `agent-orchestrator` commit `35c2bd5` (opencode-config) — Phase 8 audit hardening

## License

MIT
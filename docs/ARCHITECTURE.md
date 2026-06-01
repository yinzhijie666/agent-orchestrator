# Architecture Document

> Agent Orchestrator v1.0 — Three-Layer Multi-Model Architecture

## 1. Design Principles

Based on **Karpathy Coding Principles**:
1. **Write minimal code** — Bun built-ins replace express/ws/sqlite3 dependencies
2. **Keep it simple** — SQLite instead of PostgreSQL, single-process server
3. **Clean up after yourself** — `.env` for secrets, `.gitignore` for artifacts

## 2. Layer Separation

### Layer 1: Kimi K2.6 (Strategic)
- **Role**: Planning, architecture design, milestone review
- **Frequency**: Low (expensive, high-capability)
- **Entry**: `POST /api/plans` → generates structured Plan Document
- **Exit**: `PATCH /api/checkpoints/:id/verify` → approves/rejects milestones

### Layer 2: DeepSeek V4 Flash (Tactical)
- **Role**: Code implementation, test execution, file operations
- **Frequency**: Medium (mid-cost, high code quality)
- **Entry**: `PATCH /api/plans/:id/items/:idx` (status: active)
- **Constraint**: Cannot deviate >20% from Plan Document

### Layer 3: MiniMax M2.7 (Operational)
- **Role**: Read-only queries, file reads, grep searches
- **Frequency**: High (cheap, fast)
- **Permission**: **READ-ONLY** — no writes allowed
- **Parallel**: Can run multiple instances simultaneously

## 3. State Management

### SQLite Schema (6 tables)

```
plans ──1:N──► plan_items
  │
  ├──1:N──► checkpoints
  │
  └──1:1──► agent_threads ──1:N──► messages

activity_log (audit trail)
```

### Checkpoint Lifecycle

```
DeepSeek completes 4 items
        │
        ▼
System creates checkpoint
        │
        ▼
WebSocket broadcasts → Dashboard updates
        │
        ▼
DeepSeek PAUSES (blocks)
        │
        ▼
Kimi reviews → verifyCheckpoint()
        │
        ├──► PASSED → DeepSeek resumes
        │
        └──► FAILED → DeepSeek rolls back to previous checkpoint
```

## 4. Communication Protocol

### REST API → Async Operations
- Plan creation (slow: calls Kimi API)
- Checkpoint verification (slow: calls Kimi API)

### WebSocket → Real-time Events
- `plan.created` — New plan available
- `item.started` — DeepSeek begins work
- `item.completed` — Item finished
- `checkpoint.created` — Waiting for Kimi
- `checkpoint.verified` — Kimi decision

### Plugin → Coordinator
- HTTP fallback when WebSocket unavailable
- Polling `/api/status` every 10s as backup

## 5. Routing Logic

```javascript
if (task.type in ['planning', 'architecture', 'review']) → Kimi
if (task.type in ['coding', 'testing', 'implementation']) → DeepSeek
if (task.type in ['search', 'grep', 'read_file']) → MiniMax
default → Kimi (decomposition)
```

### Delegation Rules
```
Kimi ──can_delegate──► DeepSeek (coding)
      ──can_delegate──► MiniMax (search)

DeepSeek ──can_delegate──► MiniMax (search)

MiniMax ──cannot_delegate──► anyone (read-only)
```

## 6. Error Handling

| Error | Recovery |
|-------|----------|
| Model API timeout | Retry 3x with backoff |
| Checkpoint rejected | Rollback to last passed checkpoint |
| Server crash | SQLite persists state, resume from last checkpoint |
| Plugin disconnect | HTTP polling fallback |

## 7. Security

- API Keys in `.env` (chmod 600)
- `.env` in `.gitignore`
- MiniMax read-only enforcement (code-level)
- Rate limiting via middleware (future)

## 8. Monitoring

### Dashboard Metrics
- Active plans / total items / completed ratio
- Pending checkpoints (bottleneck indicator)
- Agent availability (API key status)
- Real-time activity log

### Log Files
- `/tmp/agent-orch.log` — Server stdout/stderr
- `server/state/db.sqlite` — Persistent state
- `activity_log` table — Audit trail

## 9. Scaling Considerations

### Current (v1.0)
- Single-process Bun server
- SQLite file database
- In-memory WebSocket connections

### Future (v2.0)
- Multi-process with Redis pub/sub
- PostgreSQL for plans, Redis for sessions
- Load-balanced WebSocket servers

## 10. Testing Strategy

### Unit Tests
- `tests/orchestrator.test.js`
- Agent Router routing table
- Milestone interval detection
- Plan validation

### Integration Tests
- Full API endpoint cycle
- WebSocket event broadcasting
- Plugin tool invocation

### End-to-End
- Create plan → Execute items → Checkpoint → Verify → Complete
- Dashboard real-time updates
- Error recovery scenarios

---

Document version: 1.0.0
Last updated: 2026-06-01
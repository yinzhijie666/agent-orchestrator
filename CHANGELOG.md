# Changelog

## v1.0.1 (2026-06-17)

### Added

- Event bus system for real-time inter-component communication (`server/lib/event-bus.js`)
- ServerManager with auto-start capability for coordinator server (`server/lib/server-manager.js`)
- Model stats tracking with `model_stats` DB table and `onModelCall` callback
- Circuit breaker for model client resilience (`server/lib/circuit-breaker.js`)
- Zen model execution: `ZenClient.executeTask()` enables full chat via opencode-zen endpoint
- Prompt executor selection criteria in `generatePlan` — LLM now knows when to use 'kimi'/'deepseek'/'zen'
- Preflight check: knowledge graph >48h → blocking error (was warning), 24-48h → warning
- Preflight check: port 8765 availability added to port conflict detection
- Cgroup-aware restart script (`scripts/cgroup-tree.sh`)

### Fixed

- Bugfix batch: circuit breaker integration, MiniMax removal, Kimi skip log, config sync, DB indexes
- Auto-executor/skill-classifier/subagent-runner improvements
- AutoDispatcher fallback chain and counter semantics
- MiniMax client removed (replaced by Zen with opencode-zen endpoint)
- Hardcoded paths cleaned up for publish readiness
- WAL files removed from tracking

### Changed

- CLAUDE.md workflow profiles updated (v3.4-v3.7)
- preflight check upgraded: three-tier knowledge graph freshness (error/warning/ok)
- Server auto-start now enabled by default
- Test baseline system with `scripts/test-baseline.sh`

### Docs

- Round learnings doc with 4 reusable patterns (`docs/lessons/2026-06-17-round-learnings.md`)
- Prompt design principle appendix in WORKFLOW-PROFILES.md
- Phase 2 skills execution design doc updates
- Audit-driven fix pipeline documented
- Architecture, checkpoint system, event bus docs created

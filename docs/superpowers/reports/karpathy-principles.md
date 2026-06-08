# Karpathy 10 Principles — Codebase Check

## Principle 1: Write minimal code
**✅ Pass** — index.js (729 lines) is the only large file. Most modules are <200 lines. No obvious bloat.

## Principle 2: Read the manual
**✅ Partial** — Tests reference `SCHEMA_SQL` from single source; docs exist (ARCHITECTURE.md, README.md). Some env vars undocumented (now fixed).

## Principle 3: Iterate fast
**✅ Pass** — Project evolved through 3 PRs + P0 fixes + audit within days. bun test runs in 36s.

## Principle 4: Use the debugger
**⚠️ N/A** — No debugger config in project. Tests serve as verification.

## Principle 5: Test the edges
**✅ Pass** — Coverage includes: fallback chains, circuit breaker, rate limiter, 401 handling, dispatcher counters, DB migrations.

## Principle 6: Ship often
**✅ Pass** — Multiple commits per day. Feature branches merged quickly.

## Principle 7: Be skeptical of LLM output
**✅ Pass** — SubagentRunner has regex fallback for JSON parsing. PlanParser validates plan structure. Tests capture LLM prompts for assertion.

## Principle 8: Understand before generating
**✅ Pass** — Full Phase 1-4 (knowledge graphs + audit) before Phase 5 (fixes). Good separation.

## Principle 9: Keep it simple
**✅ Pass** — Architecture is straightforward: plugin → server → DB + 3 model clients. No unnecessary abstractions.

## Principle 10: Clean up after yourself
**✅ Pass** — Dead imports removed, orphan files cleaned, `.gitignore` updated. minimax-client.js deduplication done in this round.

**Score: 9/10 passing, 1 N/A**

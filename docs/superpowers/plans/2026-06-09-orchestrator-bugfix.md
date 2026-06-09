# Agent Orchestrator Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 logic/design issues found in 2026-06-09 audit, grouped into 3 packages

**Architecture:** Group 1 (circuit breaker sleep bug) → Group 2 (remove minimax + Kimi skip log) → Group 3 (workflow report + config sync + DB index). Each group is independently testable.

**Tech Stack:** Bun + SQLite + OpenCode plugin

---

### Task 1: Fix circuit breaker sleep bug

**Files:**
- Modify: `server/lib/circuit-breaker.js` — add `isOpen()` method
- Modify: `server/lib/model-clients/base-client.js:70-88` — fix fallback detection logic
- Test: `tests/circuit-breaker.test.js` — update or verify existing

- [ ] **Step 1: Write the failing test**

`server/lib/circuit-breaker.js` needs `isOpen()` method:

```javascript
isOpen() {
  return this.state === STATE.OPEN;
}
```

`tests/circuit-breaker.test.js`: add test verifying `isOpen` behavior when circuit is CLOSED.

- [ ] **Step 2: Add `isOpen()` to CircuitBreaker**

```javascript
// In server/lib/circuit-breaker.js, after getStatus()
isOpen() {
  return this.state === STATE.OPEN;
}
```

- [ ] **Step 3: Fix base-client.js fallback detection**

Change `base-client.js:70-88` from:
```javascript
if (circuitBreaker) {
  const skipped = circuitBreaker.call(async () => null);
  if (skipped === null && fallbackClient) {
```
To:
```javascript
if (circuitBreaker) {
  if (circuitBreaker.isOpen() && fallbackClient) {
```

- [ ] **Step 4: Run tests to verify**

Run: `bun test tests/circuit-breaker.test.js`
Expected: PASS

- [ ] **Step 5: Run full suite**

Run: `bun test`
Expected: 319+ pass

- [ ] **Step 6: Commit**

```bash
git add server/lib/circuit-breaker.js server/lib/model-clients/base-client.js
git commit -m "fix: circuit breaker isOpen() check in chatWithFallback"
```

---

### Task 2: Remove minimax client and all references

**Files:**
- Delete: `server/lib/model-clients/minimax-client.js`
- Modify: `server/lib/plan-parser.js:26` — remove minimax from executor whitelist
- Modify: `server/lib/plan-parser.js:42` — remove minimax from executorWeights
- Modify: `server/lib/model-clients/kimi-client.js:123` — remove minimax from parsePlan
- Modify: `index.js:108` — remove minimax branch from execution loop
- Modify: `tests/prompts.test.js` — remove MiniMax Prompts section and import
- Modify: `tests/orchestrator.test.js:57` — change executor "minimax" to "zen"
- Modify: `tests/plan-orchestrator.test.js:48` — change executor "minimax" to "zen"
- Modify: `tests/skills.test.js:89` — change executor "minimax" to "zen"
- Modify: `tests/events.test.js:65` — change executor "minimax" to "deepseek"
- Modify: `tests/real-api.test.js` — remove MiniMax imports and test section
- Delete: `tests/write-forbidden.test.js` (only tests minimax)
- Modify: `server/dashboard/index.html` — remove minimax UI elements

- [ ] **Step 1: Update plan-parser.js executor whitelist**

```javascript
// Line 26: remove minimax
if (!['kimi', 'deepseek', 'zen'].includes(item.executor)) {
```

```javascript
// Line 42: remove minimax from weights
const executorWeights = { kimi: 3, deepseek: 2, zen: 1 };
```

- [ ] **Step 2: Update kimi-client.js parsePlan**

```javascript
// Line 123: remove minimax
executor: ['kimi', 'deepseek', 'zen'].includes(item.executor) ? item.executor : 'deepseek',
```

- [ ] **Step 3: Update index.js execution loop**

```javascript
// Line 108: change from:
} else if (item.executor === 'zen' || item.executor === 'minimax') {
// To:
} else if (item.executor === 'zen') {
```

- [ ] **Step 4: Delete minimax-client.js**

```bash
rm server/lib/model-clients/minimax-client.js
```

- [ ] **Step 5: Update tests/prompts.test.js**

Remove import line `import MiniMaxClient from "../server/lib/model-clients/minimax-client.js";`
Remove entire `describe("MiniMax Prompts", ...)` block.

- [ ] **Step 6: Update test data references**

`tests/orchestrator.test.js:57`: `executor: "minimax"` → `executor: "zen"`
`tests/plan-orchestrator.test.js:48`: `executor: "minimax"` → `executor: "zen"`
`tests/skills.test.js:89`: `executor: "minimax"` → `executor: "zen"`
`tests/events.test.js:65`: `executor: "minimax"` → `executor: "deepseek"`

- [ ] **Step 7: Update tests/real-api.test.js**

Remove MiniMaxClient import.
Remove `describe("Layer 3: MiniMax M3 — Operational", ...)` block.
Remove `minimax` from config key mapping.
Remove minimax from executor assertion on line 100 (change `["kimi", "deepseek", "minimax", "zen"]` to `["kimi", "deepseek", "zen"]`).
Remove minimax branch in `complete chain` test.

- [ ] **Step 8: Delete write-forbidden.test.js**

```bash
rm tests/write-forbidden.test.js
```

- [ ] **Step 9: Update dashboard HTML**

Remove `.agent-minimax` CSS class.
Remove minimax status row in dashboard.
Remove minimax-related JavaScript code.

- [ ] **Step 10: Run tests**

Run: `bun test`
Expected: 310+ pass (tests removed), 0 fail

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: remove minimax client and all references"
```

---

### Task 3: Add Kimi skip logging in execution loop

**Files:**
- Modify: `index.js:93-95` — add activity log and execResults entry when skipping kimi items

- [ ] **Step 1: Add skip log and execResults entry**

```javascript
// Change from:
if (item.executor === 'kimi') continue;

// To:
if (item.executor === 'kimi') {
  db.logActivity({ plan_id: planId, agent: 'kimi', action: 'item_skipped', details: { idx: item.idx, title: item.title } });
  execResults.push({ idx: item.idx, executor: 'kimi', status: 'skipped' });
  continue;
}
```

- [ ] **Step 2: Run tests**

Run: `bun test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "fix: log Kimi item skips in execution pipeline"
```

---

### Task 4: Fix WorkflowValidator Phase 3 reporting

**Files:**
- Modify: `server/lib/workflow-validator.js` — add usage tracking to distinguish index availability from actual usage

- [ ] **Step 1: Design the change**

Add an optional `usageCounts` parameter to `checkPhase3`. When provided, tools with `usageCount > 0` are marked as `used`;
otherwise they show as `index_available` (current behavior). This avoids breaking the existing behavior while adding
honest reporting capability.

- [ ] **Step 2: Implement**

```javascript
// checkPhase3 signature: static checkPhase3(projectDir, usageCounts = {})
// For each tool, check if usageCounts[tool] > 0 → 'used', else 'index_available'
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/workflow-validator.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/lib/workflow-validator.js
git commit -m "fix: distinguish index availability from actual tool usage in Phase 3"
```

---

### Task 5: Synchronize config.js with default.json

**Files:**
- Modify: `server/lib/config.js` — add missing dispatcher and milestone fields

- [ ] **Step 1: Update config.js**

```javascript
export const config = {
  server: {
    port: rawConfig.server?.port || 8765,
    host: rawConfig.server?.host || "127.0.0.1",
  },
  milestone: {
    interval: rawConfig.milestone?.interval || 4,
    verification_timeout_ms: rawConfig.milestone?.verification_timeout_ms || 300000,
  },
  models: rawConfig.models || {},
  auto_exec: {
    enabled: rawConfig.auto_exec?.enabled ?? true,
    max_skills: rawConfig.auto_exec?.max_skills || 20,
    model: rawConfig.auto_exec?.model || "cheap",
    timeout_ms: rawConfig.auto_exec?.timeout_ms || 90000,
    dispatcher: rawConfig.auto_exec?.dispatcher || { prefer: "run" },
  },
};
```

- [ ] **Step 2: Run tests**

Run: `bun test tests/config.test.js` or verify no breakage with full suite

- [ ] **Step 3: Commit**

```bash
git add server/lib/config.js
git commit -m "fix: sync config.js with default.json (add dispatcher + milestone fields)"
```

---

### Task 6: Add foreign key indexes to DB schema

**Files:**
- Modify: `server/lib/db-schema.js` — add CREATE INDEX statements

- [ ] **Step 1: Add indexes after existing tables**

```javascript
// At end of SCHEMA_SQL, before closing backtick:
CREATE INDEX IF NOT EXISTS idx_plan_items_plan_id ON plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_plan_id ON checkpoints(plan_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_plan_id ON activity_log(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_status ON plan_items(status);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
```

- [ ] **Step 2: Run tests**

Run: `bun test tests/db-schema.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/lib/db-schema.js
git commit -m "perf: add foreign key indexes to plan_items, checkpoints, activity_log"
```

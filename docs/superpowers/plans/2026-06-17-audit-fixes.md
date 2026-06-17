# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** Fix 3 P2 issues found during Phase 4 audit

**Architecture:** Agent-orchestrator plugin (index.js) + subagent-runner.js + kimi-client.js

**Tech Stack:** JavaScript, Bun, OpenCode plugin

---

### Task 1: Fix next_step D2 wording

**Files:**
- Modify: `index.js:741`

- [ ] **Step 1: Update D2 wording to reflect D1 actual usage**

Change:
```
Auto-exec prompt built — ready to dispatch subagent via D2 server.
```
To:
```
Auto-exec prompt built — dispatching via D1 (D2 reserved for future opencode run --attach support).
```

- [ ] **Step 2: Verify**

Run: `grep -n "dispatching via D1" index.js`
Expected: line found

- [ ] **Step 3: Commit**

### Task 2: Add post-dispatch completedSkills check note

**Files:**
- Modify: `index.js:803` (agent tool description)

- [ ] **Step 1: Add check note**

Add note after the auto_exec instruction:
```
After dispatch, verify completedSkills contains all P0 items before proceeding.
```

- [ ] **Step 2: Verify**

Run: `grep -n "completedSkills" index.js`
Expected: line with "completedSkills" exists

- [ ] **Step 3: Commit**

### Task 3: Align CAPABILITY_LIST with CAPABILITIES.md 11 capabilities

**Files:**
- Modify: `server/lib/model-clients/kimi-client.js:3-7`

- [ ] **Step 1: Update CAPABILITY_LIST to reference 11 capabilities**

Use a note that CAPABILITY_LIST is tool-focused while CAPABILITIES.md defines 11 conceptual capabilities.

- [ ] **Step 2: Verify**

- [ ] **Step 3: Commit**

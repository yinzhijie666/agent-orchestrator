// AutoExecutor: generate self-contained subagent prompts for skill auto-execution.
//
// Given the parsed suggested_skills from a plan, AutoExecutor.buildPrompt()
// produces a complete prompt that a fresh subagent can execute without any
// parent-session context. The prompt includes:
//   - Plan context (id, title, goal)
//   - Skills grouped by tier (P0/P1/P2)
//   - Tool-mapping instructions per entry type
//   - Execution rules (P0 must succeed, P1 may skip, P2 optional)
//   - Required JSON output schema
//
// Subagents dispatched from this prompt do NOT inherit system.transform
// modifications or session context, so the prompt must be self-contained.

const DEFAULT_MAX_SKILLS = 20;

const TIER_ORDER = ['P0_critical', 'P1_important', 'P2_nice_to_have'];

const TIER_LABELS = {
  P0_critical: 'P0 (BLOCKING - must succeed all before proceeding)',
  P1_important: 'P1 (Sequential, skip on failure)',
  P2_nice_to_have: 'P2 (May be skipped if time-constrained)',
};

export class AutoExecutor {
  /**
   * Map a parsed skill entry to a subagent-friendly instruction line.
   * Subagent is a full AI and can read SKILL.md files / call any tool,
   * so we keep instructions descriptive rather than hard-coding tool calls.
   *
   * @param {{tier: string, entry: string, type: string, value: string}} skill
   * @returns {string} one-line instruction
   */
  static generateInstruction(skill) {
    const value = skill.value || skill.entry;

    switch (skill.type) {
      case 'skill':
        return `Call the \`skill\` tool with name="${value}" and follow its instructions`;

      case 'command':
        return `Find the ${value} command's SKILL.md (gstack-opencode plugin or other registered skill) and follow its workflow`;

      case 'codegraph':
        return `Call the \`${value}\` MCP tool with parameters derived from the plan goal (use codegraph_status first if uncertain about args)`;

      case 'memory':
        return `Use oh-my-memory to search the memory vault for "${value}"`;

      case 'unknown':
      default:
        return `Try to execute "${value}" if a matching tool exists; otherwise mark as skipped with reason "no matching tool"`;
    }
  }

  /**
   * Build a self-contained subagent prompt from a list of parsed skills.
   *
   * @param {Array<{tier: string, entry: string, type: string, value: string}>} skills
   * @param {{planId: string, title: string, goal?: string}} planContext
   * @returns {string} complete subagent prompt
   */
  static buildPrompt(skills, planContext) {
    const ctx = planContext || {};
    const planId = ctx.planId || 'unknown';
    const title = ctx.title || 'Untitled Plan';
    const goal = ctx.goal || title;

    // Group skills by tier, preserving order
    const grouped = { P0_critical: [], P1_important: [], P2_nice_to_have: [] };
    for (const s of skills) {
      const tier = grouped[s.tier] ? s.tier : 'P2_nice_to_have';
      grouped[tier].push(s);
    }

    const sections = [];
    sections.push(`# Skill Auto-Execution Agent Prompt

## Plan Context
- Plan ID: ${planId}
- Title: ${title}
- Goal: ${goal}

## Your Role
You are a skill auto-execution agent. Execute the following skills in strict priority order. Do NOT call \`agent\` or \`agent_execute_skills\` (recursion prevention). Do NOT modify source code unless a skill explicitly requires it.

## Skills to Execute
`);

    let idx = 1;
    for (const tier of TIER_ORDER) {
      const list = grouped[tier];
      if (list.length === 0) continue;
      sections.push(`### ${TIER_LABELS[tier]}\n`);
      for (const skill of list) {
        const instruction = AutoExecutor.generateInstruction(skill);
        sections.push(`${idx}. [${skill.type}] ${skill.entry}\n   → ${instruction}\n`);
        idx++;
      }
      sections.push('\n');
    }

    sections.push(`## Execution Rules
1. Execute P0 items in listed order; if ANY P0 item fails, STOP immediately and report
2. P1 items: try in listed order, skip on failure, continue to next
3. P2 items: may be skipped if time-constrained or context-polluted
4. After each skill, record: {name, type, tier, result: completed|failed|skipped, output, error}
5. Return a single JSON object as your final response (no other text)

## Required JSON Output Schema
Return ONLY this JSON object (no prose before or after):
{
  "plan_id": "${planId}",
  "status": "success" | "partial" | "failure",
  "executed_skills": [
    {
      "name": "codegraph_context",
      "type": "codegraph",
      "tier": "P0",
      "result": "completed",
      "output": "<brief summary of what was produced>",
      "error": null
    }
  ],
  "p0_failures": [],
  "summary": "Executed N/M skills (X P0, Y P1, Z P2 skipped)"
}
`);

    return sections.join('');
  }

  /**
   * Filter and validate skills array. Removes nulls, caps at max,
   * normalizes tier field.
   *
   * @param {Array} skills - raw parsed skills
   * @param {number} [maxSkills=20] - maximum allowed
   * @returns {Array<{tier, entry, type, value}>} cleaned skills
   */
  static validate(skills, maxSkills = DEFAULT_MAX_SKILLS) {
    if (!Array.isArray(skills)) return [];

    const cleaned = [];
    for (const s of skills) {
      if (!s || typeof s !== 'object') continue;
      if (typeof s.entry !== 'string' || s.entry.length === 0) continue;

      const tier = TIER_ORDER.includes(s.tier) ? s.tier : 'P2_nice_to_have';
      const type = ['skill', 'command', 'codegraph', 'memory', 'unknown'].includes(s.type)
        ? s.type
        : 'unknown';
      const value = typeof s.value === 'string' ? s.value : s.entry;

      cleaned.push({ tier, entry: s.entry, type, value });
    }

    if (cleaned.length > maxSkills) {
      console.warn(`[AutoExecutor] Truncating ${cleaned.length} skills to maxSkills=${maxSkills}`);
      return cleaned.slice(0, maxSkills);
    }

    return cleaned;
  }
}

export default AutoExecutor;

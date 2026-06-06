// SkillClassifier: 扫描 SKILL.md 内容，自动分类为 INTERACTIVE / TOOL_REQUIRED / AUTO
//
// 三层判定（优先级：TOOL > INTERACTIVE > AUTO）：
// 1. TOOL_REQUIRED: 含 browse/playwright/screenshot/reproduction command
// 2. INTERACTIVE: 含 ask questions/present options/user approval/consent
// 3. AUTO: 含 no multi-turn/dispatch subagent/write report
// 4. 默认: AUTO

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 强 TOOL_REQUIRED 信号（优先级最高）
const STRONG_TOOL_SIGNALS = [
  /load the `browse` skill/i,
  /playwright/i,
  /capture.*screenshot/i,
  /reproduction command/i,
  /run the reproduction/i,
  /browse.*binary/i,
  /browse.*skill/i,
];

// 强 INTERACTIVE 信号
const STRONG_INTERACTIVE_SIGNALS = [
  /ask clarifying questions/i,
  /ask.*one at a time/i,
  /user approves/i,
  /which option/i,
  /present exactly these.*options/i,
  /ask for consent/i,
  /raise.*human partner/i,
  /answer questions.*provide context/i,
];

// 强 AUTO 信号（最弱优先级）
const STRONG_AUTO_SIGNALS = [
  /do not require multi-turn/i,
  /no multi-turn/i,
  /not require multi-turn/i,
  /dispatch.*subagent/i,
  /dispatch.*agent/i,
];

// 弱 TOOL 信号
const WEAK_TOOL = [
  /run.*command/i,
  /execute.*command/i,
  /test command/i,
  /bun test/i,
  /npm test/i,
  /capture.*evidence/i,
  /cookie import/i,
  /reproduce/i,
  /root cause/i,
];

// 弱 INTERACTIVE 信号
const WEAK_INTERACTIVE = [
  /ask.*clarif/i,
  /ask.*question/i,
  /write.*test.*first/i,
];

export class SkillClassifier {
  constructor(skillEntries) {
    this.skillEntries = skillEntries || [];
    this.cache = {};
  }

  classify(skillName, skillPath) {
    if (this.cache[skillName]) return this.cache[skillName];

    if (!existsSync(skillPath)) {
      return { category: 'AUTO', reason: 'SKILL.md not found, defaulting to AUTO', scores: {} };
    }

    const content = readFileSync(skillPath, 'utf-8');

    // 提取 frontmatter 之后的内容（避免元数据干扰）
    const bodyStart = content.indexOf('---', 4);
    const body = bodyStart > 0 ? content.slice(bodyStart + 3) : content;

    // Layer 1: 强 TOOL 信号（最高优先级）
    for (const regex of STRONG_TOOL_SIGNALS) {
      if (regex.test(body)) {
        return { category: 'TOOL_REQUIRED', reason: `strong TOOL: ${regex.source}`, scores: {} };
      }
    }

    // Layer 2: 强 INTERACTIVE 信号
    for (const regex of STRONG_INTERACTIVE_SIGNALS) {
      if (regex.test(body)) {
        return { category: 'INTERACTIVE', reason: `strong INTERACTIVE: ${regex.source}`, scores: {} };
      }
    }

    // Layer 3: 强 AUTO 信号
    for (const regex of STRONG_AUTO_SIGNALS) {
      if (regex.test(body)) {
        return { category: 'AUTO', reason: `strong AUTO: ${regex.source}`, scores: {} };
      }
    }

    // Layer 4: 弱信号计分
    let toolScore = 0;
    let interactiveScore = 0;

    for (const regex of WEAK_TOOL) {
      if (regex.test(body)) toolScore += 1;
    }
    for (const regex of WEAK_INTERACTIVE) {
      if (regex.test(body)) interactiveScore += 1;
    }

    if (toolScore > 0 && toolScore >= interactiveScore) {
      return { category: 'TOOL_REQUIRED', reason: `weak TOOL score=${toolScore}`, scores: { toolScore, interactiveScore } };
    }
    if (interactiveScore > 0 && interactiveScore > toolScore) {
      return { category: 'INTERACTIVE', reason: `weak INTERACTIVE score=${interactiveScore}`, scores: { toolScore, interactiveScore } };
    }

    // 默认：AUTO
    return { category: 'AUTO', reason: 'default (no strong signals)', scores: { toolScore, interactiveScore } };
  }

  classifyAll() {
    const results = {};
    for (const { name, path } of this.skillEntries) {
      results[name] = this.classify(name, path);
    }
    return results;
  }

  getByCategory(category) {
    const all = this.classifyAll();
    return Object.entries(all)
      .filter(([, v]) => v.category === category)
      .map(([k]) => k);
  }
}

export function createDefaultClassifier() {
  const home = process.env.HOME || '/home/yin';
  const entries = [];

  entries.push({ name: 'andrej-karpathy', path: join(home, '.config/opencode/skills/andrej-karpathy/SKILL.md') });

  const spSkillsDir = join(home, '.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills');
  for (const s of ['brainstorming', 'writing-plans', 'executing-plans', 'test-driven-development', 'systematic-debugging', 'subagent-driven-development', 'verification-before-completion', 'requesting-code-review', 'receiving-code-review', 'dispatching-parallel-agents', 'finishing-a-development-branch', 'using-git-worktrees', 'using-superpowers', 'writing-skills']) {
    entries.push({ name: s, path: join(spSkillsDir, s, 'SKILL.md') });
  }

  const gsBase = join(home, '.opencode/plugins/gstack-opencode/.opencode/skills');
  for (const s of ['browse', 'debug', 'design-consultation', 'design-review', 'document-release', 'gstack-upgrade', 'office-hours', 'plan-ceo-review', 'plan-design-review', 'plan-eng-review', 'qa', 'qa-only', 'retro', 'review', 'setup-browser-cookies', 'ship']) {
    entries.push({ name: s, path: join(gsBase, s, 'SKILL.md') });
  }

  return new SkillClassifier(entries);
}

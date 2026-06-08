// WorkflowValidator: checks completeness of workflow phases defined in WORKFLOW.md
// Used by agent and agent_execute_skills tools to report workflow status.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getDefaultSkillEntries } from './skill-classifier.js';

// WORKFLOW_PHASES constant - must match WORKFLOW.md definition
export const WORKFLOW_PHASES = {
  phase1: [
    { id: 'p1-1', cmd: 'graphify .', desc: '粗粒度知识图谱', check: 'graphify-out/graph.json' },
    { id: 'p1-2', cmd: '/understand', desc: '细粒度代码图谱', check: '.understand-anything/knowledge-graph.json' },
    { id: 'p1-3', cmd: 'codegraph init -i', desc: '代码语义索引', check: '.codegraph/codegraph.db' },
    { id: 'p1-4', cmd: 'graphify . --mcp', desc: 'MCP 服务器（可选）', check: null },
  ],
  phase2: {
    karpathy: ['andrej-karpathy'],
    superpowers: [
      'brainstorming', 'writing-plans', 'executing-plans', 'test-driven-development',
      'systematic-debugging', 'verification-before-completion', 'subagent-driven-development',
      'requesting-code-review', 'receiving-code-review', 'dispatching-parallel-agents',
      'finishing-a-development-branch', 'using-git-worktrees', 'using-superpowers', 'writing-skills',
    ],
    gstack: [
      'browse', 'debug', 'design-consultation', 'design-review', 'document-release',
      'gstack-upgrade', 'office-hours', 'plan-ceo-review', 'plan-design-review',
      'plan-eng-review', 'qa', 'qa-only', 'retro', 'review', 'setup-browser-cookies', 'ship',
    ],
  },
  phase3: {
    understand: [
      'understand-explain', 'understand-diff', 'understand-domain', 'understand-onboard',
      'understand-chat', 'understand-knowledge', 'understand-dashboard',
    ],
    codegraph: [
      'codegraph_context', 'codegraph_search', 'codegraph_callers', 'codegraph_callees',
      'codegraph_impact', 'codegraph_node', 'codegraph_explore', 'codegraph_files', 'codegraph_status',
    ],
    graphify: [
      'graphify query', 'graphify path', 'graphify explain', 'graphify deep',
      'graphify update', 'graphify cluster', 'graphify mcp', 'graphify add',
    ],
  },
};

// All required skills from Phase 2 (31 total)
export const ALL_REQUIRED_SKILLS = [
  ...WORKFLOW_PHASES.phase2.karpathy,
  ...WORKFLOW_PHASES.phase2.superpowers,
  ...WORKFLOW_PHASES.phase2.gstack,
];

export class WorkflowValidator {
  /**
   * Check Phase 1: graph infrastructure
   * @param {string} projectDir - project root directory
   * @returns {{passed: number, total: number, details: Array<{id: string, cmd: string, status: string}>}}
   */
  static checkPhase1(projectDir) {
    const details = [];
    let passed = 0;

    for (const step of WORKFLOW_PHASES.phase1) {
      const status = step.check
        ? (existsSync(join(projectDir, step.check)) ? 'completed' : 'missing')
        : 'optional';
      if (status === 'completed') passed++;
      details.push({ id: step.id, cmd: step.cmd, desc: step.desc, status });
    }

    return { passed, total: WORKFLOW_PHASES.phase1.length, details };
  }

  /**
   * Check Phase 2: skill availability
   * @param {string[]} loadedSkills - list of already loaded skill names
   * @returns {{passed: number, total: number, missing: string[]}}
   */
  static checkPhase2(loadedSkills = []) {
    let skills;
    if (loadedSkills.length === 0) {
      skills = getDefaultSkillEntries()
        .filter(e => existsSync(e.path))
        .map(e => e.name);
    } else {
      skills = loadedSkills;
    }
    const loaded = new Set(skills);
    const missing = ALL_REQUIRED_SKILLS.filter(s => !loaded.has(s));
    const passed = ALL_REQUIRED_SKILLS.length - missing.length;

    return { passed, total: ALL_REQUIRED_SKILLS.length, missing };
  }

  /**
   * Check Phase 3: deep analysis tools
   * @param {string} projectDir - project root directory
   * @returns {{passed: number, total: number, details: Array<{group: string, tool: string, status: string}>}}
   */
  static checkPhase3(projectDir) {
    const details = [];
    let passed = 0;
    let total = 0;

    // Check CodeGraph index
    const codegraphDb = existsSync(join(projectDir, '.codegraph', 'codegraph.db'));
    for (const tool of WORKFLOW_PHASES.phase3.codegraph) {
      total++;
      const status = codegraphDb ? 'available' : 'missing_index';
      if (status === 'available') passed++;
      details.push({ group: 'codegraph', tool, status });
    }

    // Check Understand
    const knowledgeGraph = existsSync(join(projectDir, '.understand-anything', 'knowledge-graph.json'));
    for (const tool of WORKFLOW_PHASES.phase3.understand) {
      total++;
      const status = knowledgeGraph ? 'available' : 'missing_graph';
      if (status === 'available') passed++;
      details.push({ group: 'understand', tool, status });
    }

    // Check Graphify
    const graphifyGraph = existsSync(join(projectDir, 'graphify-out', 'graph.json'));
    for (const tool of WORKFLOW_PHASES.phase3.graphify) {
      total++;
      const status = graphifyGraph ? 'available' : 'missing_graph';
      if (status === 'available') passed++;
      details.push({ group: 'graphify', tool, status });
    }

    return { passed, total, details };
  }

  /**
   * Generate full workflow report
   * @param {string} projectDir - project root directory
   * @param {string[]} loadedSkills - list of already loaded skill names
   * @returns {{phase1: object, phase2: object, phase3: object, summary: string}}
   */
  static generateReport(projectDir, loadedSkills = []) {
    const phase1 = this.checkPhase1(projectDir);
    const phase2 = this.checkPhase2(loadedSkills);
    const phase3 = this.checkPhase3(projectDir);

    const totalPassed = phase1.passed + phase2.passed + phase3.passed;
    const totalSteps = phase1.total + phase2.total + phase3.total;
    const completionRate = Math.round((totalPassed / totalSteps) * 100);

    const summary = `工作流完成度: ${totalPassed}/${totalSteps} (${completionRate}%)`;

    return { phase1, phase2, phase3, summary, totalPassed, totalSteps, completionRate };
  }

  /**
   * Format report as markdown
   * @param {object} report - from generateReport()
   * @returns {string}
   */
  static formatReport(report) {
    const lines = ['📊 完整工作流状态:', ''];

    // Phase 1
    lines.push(`**Phase 1 构建图谱**: ${report.phase1.passed}/${report.phase1.total}`);
    for (const d of report.phase1.details) {
      const icon = d.status === 'completed' ? '✅' : d.status === 'optional' ? '⏭️' : '❌';
      lines.push(`  ${icon} ${d.cmd} — ${d.desc}`);
    }
    lines.push('');

    // Phase 2
    lines.push(`**Phase 2 加载技能**: ${report.phase2.passed}/${report.phase2.total}`);
    if (report.phase2.missing.length > 0) {
      lines.push(`  ❌ 缺失: ${report.phase2.missing.join(', ')}`);
    } else {
      lines.push('  ✅ 全部技能已加载');
    }
    lines.push('');

    // Phase 3
    lines.push(`**Phase 3 深度分析**: ${report.phase3.passed}/${report.phase3.total}`);
    const groups = {};
    for (const d of report.phase3.details) {
      if (!groups[d.group]) groups[d.group] = { passed: 0, total: 0 };
      groups[d.group].total++;
      if (d.status === 'available') groups[d.group].passed++;
    }
    for (const [group, stats] of Object.entries(groups)) {
      const icon = stats.passed === stats.total ? '✅' : '⚠️';
      lines.push(`  ${icon} ${group}: ${stats.passed}/${stats.total}`);
    }
    lines.push('');

    // Summary
    lines.push(`**${report.summary}**`);

    return lines.join('\n');
  }
}

export default WorkflowValidator;

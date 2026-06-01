import { tool } from '@opencode-ai/plugin/tool';
import { z } from 'zod';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import config from './server/config/default.json' with { type: 'json' };
import { DB } from './server/lib/db.js';
import { AgentRouter } from './server/lib/agent-router.js';
import PlanParser from './server/lib/plan-parser.js';
import KimiClient from './server/lib/model-clients/kimi-client.js';
import DeepSeekClient from './server/lib/model-clients/deepseek-client.js';
import MiniMaxClient from './server/lib/model-clients/minimax-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MILESTONE_INTERVAL = config.milestone?.interval || 4;

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      plan_document TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      milestones_total INTEGER DEFAULT 0,
      milestones_completed INTEGER DEFAULT 0,
      fallback_used INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS plan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      executor TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      milestone_idx INTEGER NOT NULL,
      agent_outputs TEXT,
      verification_status TEXT DEFAULT 'pending',
      verification_feedback TEXT,
      verified_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      verified_at DATETIME,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );
    CREATE TABLE IF NOT EXISTS agent_threads (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      context_window TEXT,
      layer_states TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES agent_threads(id)
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT,
      agent TEXT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function executePlanTask(task, context, kimiClient, deepseekClient, minimaxClient, db) {
  // Step 0: Kimi decides plan or build mode
  let modeAnalysis;
  try {
    modeAnalysis = await kimiClient.analyzeTaskMode(task, context);
  } catch (err) {
    console.error('[AgentOrchestrator] Mode analysis failed, defaulting to build:', err.message);
    modeAnalysis = { mode: 'build', reason: `Fallback: ${err.message}` };
  }

  if (modeAnalysis.mode === 'plan') {
    const analysis = await kimiClient.chat([
      {
        role: 'system',
        content: '你是分析 agent。只读分析任务，提供深入见解。不要写代码。分析结束时给出明确的结论和建议。'
      },
      {
        role: 'user',
        content: `Task: ${task}\n\nContext: ${context || '无'}\n\n提供详细分析。`
      }
    ]);
    const recommendations = await generateRecommendations(task, kimiClient);
    return { mode: 'plan', analysis, reason: modeAnalysis.reason, recommendations };
  }

  // Build mode: existing flow
  let planDoc;
  let fallbackUsed = false;

  try {
    planDoc = await kimiClient.generatePlan(task, context);
  } catch (err) {
    console.error('[AgentOrchestrator] Kimi failed, trying DeepSeek:', err.message);
    try {
      planDoc = await deepseekClient.generatePlan(task, context);
      fallbackUsed = true;
    } catch (fallbackErr) {
      throw new Error(`Both Kimi and DeepSeek failed: ${err.message}; ${fallbackErr.message}`);
    }
  }

  const validation = PlanParser.validate(planDoc);
  if (!validation.valid) {
    throw new Error(`Invalid plan: ${validation.errors.join(', ')}`);
  }

  const planId = randomUUID();
  db.createPlan({
    id: planId,
    title: planDoc.title,
    plan_document: JSON.stringify(planDoc),
    status: 'active',
    milestones_total: Math.ceil(planDoc.items.length / MILESTONE_INTERVAL),
    fallback_used: fallbackUsed,
  });

  planDoc.items.forEach(item => {
    db.createPlanItem({
      plan_id: planId,
      idx: item.idx,
      title: item.title,
      description: item.description,
      executor: item.executor,
      status: 'pending',
    });
  });

  db.createThread({
    id: randomUUID(),
    plan_id: planId,
    context_window: {},
    layer_states: { kimi: {}, deepseek: {}, minimax: {} },
  });

  db.logActivity({
    plan_id: planId,
    agent: fallbackUsed ? 'deepseek' : 'kimi',
    action: 'plan_created',
    details: { title: planDoc.title, items_count: planDoc.items.length, fallback: fallbackUsed },
  });

  // Auto-execution pump: execute items sequentially by assigned agent
  const execResults = [];
  for (const item of planDoc.items) {
    if (item.executor === 'kimi') continue;

    db.updatePlanItemStatus(planId, item.idx, 'active');
    db.logActivity({ plan_id: planId, agent: item.executor, action: 'item_started', details: { idx: item.idx, title: item.title } });

    try {
      let result;
      if (item.executor === 'deepseek') {
        const res = await deepseekClient.executeTask(item, context);
        result = res.result || res.status;
        db.updatePlanItemStatus(planId, item.idx, 'completed', result);
        db.logActivity({ plan_id: planId, agent: 'deepseek', action: 'item_completed', details: { idx: item.idx, title: item.title } });
      } else if (item.executor === 'minimax') {
        const query = `${item.title}: ${item.description || item.acceptance_criteria || ''}`;
        result = await minimaxClient.searchCode(query, context);
        db.updatePlanItemStatus(planId, item.idx, 'completed', result);
        db.logActivity({ plan_id: planId, agent: 'minimax', action: 'item_completed', details: { idx: item.idx, title: item.title } });
      }
      execResults.push({ idx: item.idx, executor: item.executor, status: 'completed' });
    } catch (err) {
      console.error(`[AgentOrchestrator] Item ${item.idx} (${item.executor}) failed:`, err.message);
      db.updatePlanItemStatus(planId, item.idx, 'failed', err.message);
      db.logActivity({ plan_id: planId, agent: item.executor, action: 'item_failed', details: { idx: item.idx, title: item.title, error: err.message } });
      execResults.push({ idx: item.idx, executor: item.executor, status: 'failed', error: err.message });
    }
  }

  const completedCount = execResults.filter(r => r.status === 'completed').length;
  const failedCount = execResults.filter(r => r.status === 'failed').length;

  const recommendations = await generateRecommendations(planDoc, kimiClient);

  const items = planDoc.items.map(i =>
    `${i.idx + 1}. [${i.executor}] ${i.title}${i.description ? ': ' + i.description : ''}`
  ).join('\n');

  const execSummary = execResults.map(r =>
    `  ${r.status === 'completed' ? '✅' : '❌'} [${r.executor}] Item ${r.idx}${r.error ? ': ' + r.error : ''}`
  ).join('\n');

  return { mode: 'build', planId, title: planDoc.title, items, itemCount: planDoc.items.length, execSummary, completedCount, failedCount, fallback: fallbackUsed, recommendations };
}

async function generateRecommendations(planOrTask, kimiClient) {
  try {
    const recs = await kimiClient.chat([
      {
        role: 'system',
        content: `你是工具推荐 agent。基于任务内容，列出后续建议使用的 OpenCode 能力。
包括这些类别（每类最多选 2 个最相关的）：
- Superpowers skills: brainstorming, writing-plans, test-driven-development, systematic-debugging, subagent-driven-development, verification-before-completion, requesting-code-review, receiving-code-review
- GStack commands: /browse, /debug, /design-consultation, /design-review, /document-release, /office-hours, /plan-ceo-review, /plan-design-review, /plan-eng-review, /qa, /qa-only, /retro, /review, /setup-browser-cookies, /ship
- Cloud skills: 根据技术领域匹配对应的云端技能类别，如 frontend-category-pointer, cloud-category-pointer, security-category-pointer, devops-category-pointer, data-science-category-pointer, database-category-pointer, testing-category-pointer, ai-ml-category-pointer, backend-category-pointer, mobile-category-pointer
- CodeGraph MCP: codegraph_context, codegraph_search, codegraph_callers, codegraph_callees, codegraph_impact, codegraph_node, codegraph_explore, codegraph_files, codegraph_status
- Understand commands: /understand-explain, /understand-diff, /understand-domain, /understand-onboard
- Graphify: /graphify, /graphify query
- Knowledge: oh-my-memory 搜索相关记忆, 相关 .md 文档路径
- Automation: verify.sh, skills-manager

返回格式：简洁列表，每行一个建议，格式为 "- [类别] 建议内容"。不解释原因。`
      },
      {
        role: 'user',
        content: `Task: ${typeof planOrTask === 'string' ? planOrTask : JSON.stringify({ title: planOrTask.title, items: planOrTask.items.map(i => ({ title: i.title, description: i.description })) })}\n\n列出建议。`
      }
    ]);
    return recs;
  } catch (err) {
    console.error('[AgentOrchestrator] Recommendation generation failed:', err.message);
    return null;
  }
}

function loadEnvFile(envPath) {
  try {
    const text = readFileSync(envPath, 'utf-8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (e) {
    console.warn('[AgentOrchestrator] Could not load .env:', e.message);
  }
}

export const AgentOrchestratorPlugin = async ({ directory }) => {
  loadEnvFile(join(__dirname, '.env'));

  const dbDir = join(__dirname, 'server', 'state');
  const dbPath = process.env.AGENT_ORCHESTRATOR_DB_PATH || join(dbDir, 'db.sqlite');

  await mkdir(dirname(dbPath), { recursive: true });

  const database = new Database(dbPath, { create: true });
  initSchema(database);
  database.close();

  const db = new DB(dbPath);
  const kimiClient = new KimiClient(config.models.kimi);
  const deepseekClient = new DeepSeekClient(config.models.deepseek);
  const minimaxClient = new MiniMaxClient(config.models.minimax);

  return {
    tool: {
      agent: tool({
        description: 'Auto-route every user request. Kimi decides plan mode (analysis) or build mode (DeepSeek/MiniMax execute). Must be called for ALL user requests.',
        args: z.object({
          task: z.string().describe('The task or goal to accomplish'),
          context: z.string().optional().describe('Additional context for the task'),
        }),
        execute: async ({ task, context }) => {
          try {
            const result = await executePlanTask(task, context || '', kimiClient, deepseekClient, minimaxClient, db);
            let output;
            if (result.mode === 'plan') {
              output = `📋 [Plan Mode] ${result.reason}\n\n${result.analysis}`;
              if (result.recommendations) {
                output += `\n\n💡 建议后续:\n${result.recommendations}`;
              }
            } else {
              output = `🔧 [Build Mode] ${result.reason || ''}\n\n📋 Plan: ${result.title}\n\nID: \`${result.planId}\`\nItems (${result.itemCount}):\n${result.items}`;
              if (result.execSummary) {
                output += `\n\nExecution Results (✅ ${result.completedCount}/${result.itemCount}):\n${result.execSummary}`;
              }
              if (result.fallback) {
                output += '\n\n⚠️ Note: Kimi was unavailable, plan created by DeepSeek (fallback).';
              }
              if (result.recommendations) {
                output += `\n\n💡 建议后续:\n${result.recommendations}`;
              }
            }
            return { output };
          } catch (err) {
            return { output: `Error: ${err.message}` };
          }
        },
      }),

      agent_status: tool({
        description: 'View orchestrator status: plans count, item progress, checkpoint state, model API key availability.',
        args: z.object({}),
        execute: async () => {
          try {
            const planCounts = db.db.prepare(
              "SELECT status, COUNT(*) as count FROM plans GROUP BY status"
            ).all();

            const totalItems = db.db.prepare("SELECT COUNT(*) as count FROM plan_items").get();
            const completedItems = db.db.prepare("SELECT COUNT(*) as count FROM plan_items WHERE status = 'completed'").get();
            const pendingCheckpoints = db.db.prepare("SELECT COUNT(*) as count FROM checkpoints WHERE verification_status = 'pending'").get();

            const recentPlans = db.db.prepare(
              "SELECT id, title, status FROM plans ORDER BY created_at DESC LIMIT 5"
            ).all();

            const kimiOk = !!process.env.OPENCODE_API_KEY;
            const deepseekOk = !!process.env.DEEPSEEK_API_KEY;
            const minimaxOk = !!process.env.MINIMAX_API_KEY;

            const counts = {};
            for (const row of planCounts) {
              counts[row.status] = row.count;
            }

            let output = `🧠 Agent Orchestrator Status\n\n`;
            output += `Plans: ${Object.values(counts).reduce((a, b) => a + b, 0) || 0} total`;
            if (counts.active) output += `, ${counts.active} active`;
            if (counts.completed) output += `, ${counts.completed} completed`;
            if (counts.pending) output += `, ${counts.pending} pending`;
            output += `\nItems: ${totalItems.count} total, ${completedItems.count} completed`;
            output += `\nPending Checkpoints: ${pendingCheckpoints.count}`;

            if (recentPlans.length > 0) {
              output += `\n\nRecent Plans:\n`;
              for (const p of recentPlans) {
                const icon = p.status === 'active' ? '▶' : p.status === 'completed' ? '✅' : '📋';
                output += `  ${icon} ${p.title} (\`${p.id.slice(0, 8)}…\`) - ${p.status}\n`;
              }
            }

            output += `\nAgent Availability:\n`;
            output += `  🧠 Kimi:     ${kimiOk ? '✅' : '❌'}\n`;
            output += `  🔧 DeepSeek: ${deepseekOk ? '✅' : '❌'}\n`;
            output += `  ⚡ MiniMax:  ${minimaxOk ? '✅' : '❌'}\n`;
            return { output };
          } catch (err) {
            return { output: `Error: ${err.message}` };
          }
        },
      }),

      agent_checkpoint: tool({
        description: 'Create a milestone checkpoint for Kimi review, or verify one. Checkpoints occur every 4 completed items.',
        args: z.object({
          action: z.enum(['create', 'verify']).describe('"create" to create checkpoint, "verify" to have Kimi review'),
          plan_id: z.string().describe('The plan ID'),
          result: z.string().optional().describe('Verification result: "passed" or "failed" (for verify action)'),
        }),
        execute: async ({ action, plan_id, result }) => {
          try {
            if (action === 'create') {
              const items = db.getPlanItems(plan_id);
              const completed = items.filter(i => i.status === 'completed').length;
              const total = items.length;
              const milestoneIdx = Math.min(
                completed === 0 ? MILESTONE_INTERVAL : Math.ceil(completed / MILESTONE_INTERVAL) * MILESTONE_INTERVAL,
                total
              );

              const checkpointId = randomUUID();
              db.createCheckpoint({
                id: checkpointId,
                plan_id,
                milestone_idx: milestoneIdx,
                agent_outputs: { completed_items: items.filter(i => i.idx < milestoneIdx) },
                verification_status: 'pending',
              });

              db.logActivity({
                plan_id,
                agent: 'system',
                action: 'checkpoint_created',
                details: { checkpoint_id: checkpointId, milestone_idx: milestoneIdx },
              });

              return { output: `🛑 Checkpoint created at milestone ${milestoneIdx}\nID: \`${checkpointId}\`\nStatus: waiting for Kimi verification\n\nUse agent_checkpoint with action="verify" and plan_id="${plan_id}" to have Kimi review.` };
            }

            if (action === 'verify') {
              const pending = db.db.prepare(
                "SELECT * FROM checkpoints WHERE plan_id = ? AND verification_status = 'pending' ORDER BY created_at DESC LIMIT 1"
              ).get(plan_id);

              if (!pending) {
                return { output: 'No pending checkpoints to verify for this plan.' };
              }

              const reviewResult = result === 'failed'
                ? { status: 'failed', feedback: 'Checkpoint review failed. Items need revision before proceeding.' }
                : { status: 'passed', feedback: 'Checkpoint review passed. Proceed to next items.' };

              db.verifyCheckpoint(pending.id, reviewResult.status, reviewResult.feedback);

              db.logActivity({
                plan_id,
                agent: 'kimi',
                action: 'checkpoint_verified',
                details: { checkpoint_id: pending.id, result: reviewResult.status },
              });

              const icon = reviewResult.status === 'passed' ? '✅' : '❌';
              return { output: `${icon} Checkpoint verified: ${reviewResult.status}\nFeedback: ${reviewResult.feedback}\nMilestone: item ${pending.milestone_idx}` };
            }

            return { output: 'Error: action must be "create" or "verify"' };
          } catch (err) {
            return { output: `Error: ${err.message}` };
          }
        },
      }),
    },

    "experimental.chat.system.transform": async (_input, output) => {
      const contextBlock = `

## Agent Orchestrator

You have access to a three-layer orchestrator system. ALL tasks MUST be automatically routed through \`agent\`:

- \`agent\`: AUTO-ROUTE every user request through this tool. Kimi decides plan mode (analysis) or build mode (execution)
- \`agent_status\`: Check orchestrator state, progress, and model availability
- \`agent_checkpoint\`: Manage milestone reviews (every 4 items, Kimi reviews before continuing)

**IMPORTANT: Do NOT ask the user to use \`agent task="..."\`. Silently route every request yourself.**
For simple questions → \`agent task="<question>"\` (auto mode → no build needed)
For complex tasks → \`agent task="<task description>"\` (Kimi decides plan or build)`;
      output.system += contextBlock;
    },

    dispose: async () => {
      db.close();
    },
  };
};

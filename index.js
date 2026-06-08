import { tool } from '@opencode-ai/plugin/tool';
import { z } from 'zod';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import config from './server/config/default.json' with { type: 'json' };
import { SCHEMA_SQL } from './server/lib/db-schema.js';
import { DB } from './server/lib/db.js';
import {
  emitCheckpointCreated,
  emitCheckpointVerified,
  emitItemCompleted,
  emitItemStarted,
  emitModelFallback,
  emitPlanCompleted,
  emitPlanCreated,
} from './server/lib/events.js';
import KimiClient, { CAPABILITY_LIST } from './server/lib/model-clients/kimi-client.js';
import DeepSeekClient from './server/lib/model-clients/deepseek-client.js';
import ZenClient from './server/lib/model-clients/zen-client.js';
import { PlanOrchestrator } from './server/lib/plan-orchestrator.js';
import { AutoExecutor } from './server/lib/auto-executor.js';
import { AutoDispatcher } from './server/lib/auto-dispatcher.js';
import { WorkflowValidator, ALL_REQUIRED_SKILLS } from './server/lib/workflow-validator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MILESTONE_INTERVAL = config.milestone?.interval || 4;
const AUTO_EXEC_DEFAULTS = config.auto_exec || { enabled: true, max_skills: 20, model: 'cheap' };

function initSchema(database) {
  database.exec(SCHEMA_SQL);
}

async function executePlanTask(task, context, kimiClient, deepseekClient, zenClient, db) {
  // Step 0: Kimi decides plan or build mode
  let modeAnalysis;
  try {
    modeAnalysis = await kimiClient.analyzeTaskMode(task, context, deepseekClient);
  } catch (err) {
    console.error('[AgentOrchestrator] Mode analysis failed, defaulting to build:', err.message);
    modeAnalysis = { mode: 'build', reason: `Fallback: ${err.message}` };
  }

  if (modeAnalysis.mode === 'plan') {
    let analysis;
    try {
      const analysisResult = await kimiClient.chatWithFallback([
        {
          role: 'system',
          content: `你是分析 agent。只读分析任务，提供深入见解。不要写代码。分析结束时给出明确的结论和建议。

可用能力清单（推荐 3-5 项）:
${CAPABILITY_LIST}`
        },
        {
          role: 'user',
          content: `Task: ${task}\n\nContext: ${context || '无'}\n\n提供详细分析。`
        }
      ], { max_tokens: 4000 }, deepseekClient);
      analysis = analysisResult.content || analysisResult;
    } catch (err) {
      analysis = `分析失败: ${err.message}`;
    }
    const recommendations = await generateRecommendations(task, kimiClient, deepseekClient);
    return { mode: 'plan', analysis, reason: modeAnalysis.reason, recommendations, suggested_skills: modeAnalysis.suggested_skills || {} };
  }

  // Build mode: existing flow
  const { planId, planDoc, fallbackUsed } = await PlanOrchestrator.generateAndPersist({
    prompt: task,
    context,
    kimiClient,
    deepseekClient,
    db,
    status: 'active',
    milestoneInterval: MILESTONE_INTERVAL,
  });

  emitPlanCreated(planId, planDoc);
  if (fallbackUsed) {
    emitModelFallback('kimi', 'deepseek', 'plan_generation');
  }

  if (!db) {
    return { mode: 'build', planId: null, title: 'Error: DB unavailable', items: '', itemCount: 0, execSummary: '❌ Database unavailable', completedCount: 0, failedCount: 0, fallback: false, recommendations: null, suggested_skills: {} };
  }

  // Auto-execution pump: execute items sequentially by assigned agent
  const execResults = [];
  for (const item of planDoc.items) {
    if (item.executor === 'kimi') continue;

    db.updatePlanItemStatus(planId, item.idx, 'active');
    db.logActivity({ plan_id: planId, agent: item.executor, action: 'item_started', details: { idx: item.idx, title: item.title } });
    emitItemStarted(planId, item);

    try {
      let result;
      if (item.executor === 'deepseek') {
        const res = await deepseekClient.executeTask(item, context);
        result = res.result || res.status;
        db.updatePlanItemStatus(planId, item.idx, 'completed', result);
        db.logActivity({ plan_id: planId, agent: 'deepseek', action: 'item_completed', details: { idx: item.idx, title: item.title } });
        emitItemCompleted(planId, item, 'completed');
      } else if (item.executor === 'zen' || item.executor === 'minimax') {
        const query = `${item.title}: ${item.description || item.acceptance_criteria || ''}`;
        result = await zenClient.searchCode(query, context);
        db.updatePlanItemStatus(planId, item.idx, 'completed', result);
        db.logActivity({ plan_id: planId, agent: 'zen', action: 'item_completed', details: { idx: item.idx, title: item.title } });
        emitItemCompleted(planId, item, 'completed');
      }
      execResults.push({ idx: item.idx, executor: item.executor, status: 'completed' });
    } catch (err) {
      console.error(`[AgentOrchestrator] Item ${item.idx} (${item.executor}) failed:`, err.message);
      db.updatePlanItemStatus(planId, item.idx, 'failed', err.message);
      db.logActivity({ plan_id: planId, agent: item.executor, action: 'item_failed', details: { idx: item.idx, title: item.title, error: err.message } });
      emitItemCompleted(planId, item, 'failed');
      execResults.push({ idx: item.idx, executor: item.executor, status: 'failed', error: err.message });
    }
  }

  const completedCount = execResults.filter(r => r.status === 'completed').length;
  const failedCount = execResults.filter(r => r.status === 'failed').length;

  const finalStatus = failedCount > 0 ? 'completed_with_errors' : 'completed';
  db.updatePlanStatus(planId, finalStatus);
  db.logActivity({
    plan_id: planId,
    agent: 'system',
    action: 'plan_completed',
    details: { completed: completedCount, failed: failedCount, status: finalStatus },
  });
  emitPlanCompleted(planId, finalStatus);
  const recommendations = await generateRecommendations(planDoc, kimiClient, deepseekClient);

  const items = planDoc.items.map(i =>
    `${i.idx + 1}. [${i.executor}] ${i.title}${i.description ? ': ' + i.description : ''}`
  ).join('\n');

  const execSummary = execResults.map(r =>
    `  ${r.status === 'completed' ? '✅' : '❌'} [${r.executor}] Item ${r.idx + 1}${r.error ? ': ' + r.error : ''}`
  ).join('\n');

  return { mode: 'build', planId, title: planDoc.title, items, itemCount: planDoc.items.length, execSummary, completedCount, failedCount, fallback: fallbackUsed, recommendations, suggested_skills: planDoc.suggested_skills || {} };
}

async function generateRecommendations(planOrTask, kimiClient, deepseekClient) {
  try {
    const recs = await kimiClient.chatWithFallback([
      {
        role: 'system',
        content: `你是工具推荐 agent。基于任务内容，列出后续建议使用的 OpenCode 能力。
包括这些类别（每类最多选 2 个最相关的）：
${CAPABILITY_LIST}

返回格式：简洁列表，每行一个建议，格式为 "- [类别] 建议内容"。不解释原因。`
      },
      {
        role: 'user',
        content: `Task: ${typeof planOrTask === 'string' ? planOrTask : JSON.stringify({ title: planOrTask.title, items: planOrTask.items.map(i => ({ title: i.title, description: i.description })) })}\n\n列出建议。`
      }
    ], { max_tokens: 1500 }, deepseekClient);
    return recs?.content || recs;
  } catch (err) {
    console.error('[AgentOrchestrator] Recommendation generation failed:', err.message);
    return null;
  }
}

function formatSuggestedSkills(skills) {
  if (!skills || typeof skills !== 'object') return '';
  const hasSkills = (skills.P0_critical?.length || 0) +
                    (skills.P1_important?.length || 0) +
                    (skills.P2_nice_to_have?.length || 0);
  if (hasSkills === 0) return '';
  let out = '\n\n💡 建议后续:';
  if (skills.P0_critical?.length) {
    out += '\n🔴 P0 (必选):\n  ' + skills.P0_critical.join('\n  ');
  }
  if (skills.P1_important?.length) {
    out += '\n🟡 P1 (推荐):\n  ' + skills.P1_important.join('\n  ');
  }
  if (skills.P2_nice_to_have?.length) {
    out += '\n🟢 P2 (可选):\n  ' + skills.P2_nice_to_have.join('\n  ');
  }
  return out;
}

function parseSkillAction(entry) {
  if (typeof entry !== "string") return { type: "unknown", value: String(entry) };
  if (entry.startsWith("skill ")) return { type: "skill", value: entry.slice(6).trim() };
  if (entry.startsWith("/")) return { type: "command", value: entry };
  if (entry.startsWith("codegraph_")) return { type: "codegraph", value: entry };
  if (entry.includes("oh-my-memory") || entry.includes("search memory")) {
    return { type: "memory", value: entry };
  }
  return { type: "unknown", value: entry };
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

  let db = null;
  let dbInitError = null;
  try {
    await mkdir(dirname(dbPath), { recursive: true });
    const database = new Database(dbPath, { create: true });
    initSchema(database);
    database.close();
    db = new DB(dbPath);
  } catch (e) {
    dbInitError = e;
    console.warn('[AgentOrchestrator] DB initialization failed, stateful tools will return errors:', e.message);
  }

  let autoDispatcher = null;
  try {
    const autoDispatchDisabled = process.env.AUTO_EXEC_DISPATCH === 'false' || process.env.AUTO_EXEC_DISABLED === 'true';
    if (autoDispatchDisabled) {
      console.log('[AgentOrchestrator] AutoDispatcher disabled by env (AUTO_EXEC_DISPATCH=false)');
    } else {
      autoDispatcher = new AutoDispatcher(config);
      const startResult = await autoDispatcher.start();
      if (startResult.started) {
        console.log('[AgentOrchestrator] AutoDispatcher started: D2 url=' + startResult.url);
        attachDispatcherSignalHandlers(autoDispatcher);
      } else {
        console.log('[AgentOrchestrator] AutoDispatcher running in D1-only mode:', startResult.reason || startResult.error || 'no reason');
      }
    }
  } catch (e) {
    console.warn('[AgentOrchestrator] AutoDispatcher init failed, agent_execute_skills will not auto-dispatch:', e.message);
    if (autoDispatcher) {
      try { await autoDispatcher.stop(); } catch {}
    }
    autoDispatcher = null;
  }
  const kimiClient = new KimiClient(config.models.kimi);
  const deepseekClient = new DeepSeekClient(config.models.deepseek);
  const zenClient = new ZenClient(config.models["opencode-zen"]);

  return {
    tool: {
      agent: tool({
        description: 'Auto-route every user request. Kimi decides plan mode (analysis) or build mode (DeepSeek/Zen execute). Must be called for ALL user requests.',
        args: z.object({
          task: z.string().describe('The task or goal to accomplish'),
          context: z.string().optional().describe('Additional context for the task'),
        }),
        execute: async ({ task, context }) => {
          try {
            const result = await executePlanTask(task, context || '', kimiClient, deepseekClient, zenClient, db);
            let output;
            if (result.mode === 'plan') {
              output = `📋 [Plan Mode] ${result.reason}\n\n${result.analysis}`;
              const skillsOutput = formatSuggestedSkills(result.suggested_skills);
              if (skillsOutput) {
                output += skillsOutput;
              } else if (result.recommendations) {
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
              const skillsOutput = formatSuggestedSkills(result.suggested_skills);
              if (skillsOutput) {
                output += skillsOutput;
              } else if (result.recommendations) {
                output += `\n\n💡 建议后续:\n${result.recommendations}`;
              }
            }

            // Add workflow status report
            try {
              const workflowReport = WorkflowValidator.generateReport(__dirname);
              output += '\n\n' + WorkflowValidator.formatReport(workflowReport);
            } catch (e) {
              // WorkflowValidator is non-critical, don't fail the tool
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
          if (!db) {
            return { output: `Error: database unavailable (${dbInitError?.message || 'unknown'})` };
          }
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

            const kimiOk = !!(process.env.KIMI_API_KEY || process.env.OPENCODE_API_KEY);
            const deepseekOk = !!process.env.DEEPSEEK_API_KEY;
            const zenOk = !!process.env.OPENCODE_API_KEY;

            const counts = {};
            for (const row of planCounts) {
              counts[row.status] = row.count;
            }

            let output = `🧠 Agent Orchestrator Status\n\n`;
            output += `Plans: ${Object.values(counts).reduce((a, b) => a + b, 0) || 0} total`;
            if (counts.active) output += `, ${counts.active} active`;
            if (counts.completed) output += `, ${counts.completed} completed`;
            if (counts.completed_with_errors) output += `, ${counts.completed_with_errors} with errors`;
            if (counts.pending) output += `, ${counts.pending} pending`;
            output += `\nItems: ${totalItems.count} total, ${completedItems.count} completed`;
            output += `\nPending Checkpoints: ${pendingCheckpoints.count}`;

            if (recentPlans.length > 0) {
              output += `\n\nRecent Plans:\n`;
              for (const p of recentPlans) {
                const icon = p.status === 'active' ? '▶' : p.status === 'completed' ? '✅' : p.status === 'completed_with_errors' ? '⚠️' : '📋';
                output += `  ${icon} ${p.title} (\`${p.id.slice(0, 8)}…\`) - ${p.status}\n`;
              }
            }

            output += `\nAgent Availability:\n`;
            output += `  🧠 Kimi:     ${kimiOk ? '✅' : '❌'}\n`;
            output += `  🔧 DeepSeek: ${deepseekOk ? '✅' : '❌'}\n`;
            output += `  ⚡ Zen:      ${zenOk ? '✅' : '❌'}\n`;
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
          if (!db) {
            return { output: `Error: database unavailable (${dbInitError?.message || 'unknown'})` };
          }
          try {
            if (action === 'create') {
              const items = db.getPlanItems(plan_id);
              const completed = items.filter(i => i.status === 'completed').length;
              if (completed === 0) {
                return { output: 'No completed items yet. Checkpoint requires at least one completed item.' };
              }
              const total = items.length;
              const milestoneIdx = Math.min(
                Math.ceil(completed / MILESTONE_INTERVAL) * MILESTONE_INTERVAL,
                total
              );

              const checkpointId = randomUUID();
              db.createCheckpoint({
                id: checkpointId,
                plan_id,
                milestone_idx: milestoneIdx,
                agent_outputs: {
                  items_before_milestone: items
                    .filter(i => i.idx < milestoneIdx)
                    .map(i => ({ idx: i.idx, title: i.title, executor: i.executor, status: i.status, result: i.result })),
                  milestone_idx: milestoneIdx,
                },
                verification_status: 'pending',
              });

              db.logActivity({
                plan_id,
                agent: 'system',
                action: 'checkpoint_created',
                details: { checkpoint_id: checkpointId, milestone_idx: milestoneIdx },
              });
              emitCheckpointCreated(plan_id, checkpointId, milestoneIdx);

              return { output: `🛑 Checkpoint created at milestone ${milestoneIdx}\nID: \`${checkpointId}\`\nStatus: waiting for Kimi verification\n\nUse agent_checkpoint with action="verify" and plan_id="${plan_id}" to have Kimi review.` };
            }

            if (action === 'verify') {
              const pending = db.db.prepare(
                "SELECT * FROM checkpoints WHERE plan_id = ? AND verification_status = 'pending' ORDER BY created_at DESC LIMIT 1"
              ).get(plan_id);

              if (!pending) {
                return { output: 'No pending checkpoints to verify for this plan.' };
              }

              const plan = db.getPlan(plan_id);
              const enrichedCheckpoint = {
                ...pending,
                plan_title: plan?.title || 'Unknown Plan',
              };

              let reviewResult;
              let fallbackUsed = false;
              try {
                reviewResult = await kimiClient.reviewCheckpoint(enrichedCheckpoint, deepseekClient);
              } catch (err) {
                console.error('[AgentOrchestrator] Kimi review failed:', err.message);
                reviewResult = {
                  status: 'passed',
                  feedback: `Auto-passed: Kimi unavailable (${err.message})`,
                };
                fallbackUsed = true;
                db.logActivity({
                  plan_id,
                  agent: 'system',
                  action: 'checkpoint_auto_passed',
                  details: { checkpoint_id: pending.id, reason: err.message },
                });
              }

              if (result === 'failed') {
                const prev = reviewResult.feedback || '';
                const note = fallbackUsed
                  ? 'User override: marked as failed (Kimi auto-pass overridden).'
                  : 'User override: marked as failed.';
                reviewResult = {
                  status: 'failed',
                  feedback: prev + (prev ? '\n' : '') + note,
                };
              }

              db.verifyCheckpoint(pending.id, reviewResult.status, reviewResult.feedback);

              if (reviewResult.status === 'passed') {
                db.db.prepare(
                  "UPDATE plans SET milestones_completed = milestones_completed + 1 WHERE id = ?"
                ).run(plan_id);
              }

              db.logActivity({
                plan_id,
                agent: 'kimi',
                action: 'checkpoint_verified',
                details: { checkpoint_id: pending.id, result: reviewResult.status, fallback: fallbackUsed },
              });

              const icon = reviewResult.status === 'passed' ? '✅' : '❌';
              const fallbackNote = fallbackUsed ? '\n⚠️ Kimi was unavailable, auto-passed.' : '';
              emitCheckpointVerified(pending.id, reviewResult.status, plan_id);
              return { output: `${icon} Checkpoint verified: ${reviewResult.status}\nFeedback: ${reviewResult.feedback}\nMilestone: item ${pending.milestone_idx}${fallbackNote}` };
            }

            } catch (err) {
              return { output: `Error: ${err.message}` };
            }
          },
        }),

      agent_execute_skills: tool({
        description: 'MUST be called after any `agent` tool call when output contains "💡 建议后续:". Returns a prioritized execution list of skills extracted from the plan\'s suggested_skills section. When AUTO_EXEC is enabled, also returns auto_exec.prompt for subagent dispatch. Do NOT skip P0 items.',
        args: z.object({
          plan_id: z.string().optional().describe('Plan ID. If omitted, uses the most recently created plan.'),
        }),
        execute: async ({ plan_id }) => {
          if (!db) {
            return {
              output: JSON.stringify({
                plan_id: null,
                skills_to_execute: [],
                total: 0,
                auto_exec: null,
                auto_dispatched: false,
                error: `database unavailable: ${dbInitError?.message || 'unknown'}`,
              }),
            };
          }
          try {
            const plan = plan_id ? db.getPlan(plan_id) : db.getRecentPlan();

            if (!plan) {
              return {
                output: JSON.stringify({
                  plan_id: null,
                  skills_to_execute: [],
                  next_step: 'No plan found. Run `agent` first to create one.'
                })
              };
            }

            let planDoc;
            try {
              planDoc = JSON.parse(plan.plan_document);
            } catch {
              planDoc = {};
            }

            const skills = planDoc.suggested_skills || {};
            const rawItems = [];

            for (const tier of ['P0_critical', 'P1_important', 'P2_nice_to_have']) {
              const list = skills[tier] || [];
              for (const entry of list) {
                const action = parseSkillAction(entry);
                rawItems.push({ tier, entry, ...action });
              }
            }

            // Supplement with ALL_REQUIRED_SKILLS (only missing ones, tier P1)
            for (const skill of ALL_REQUIRED_SKILLS) {
              if (!rawItems.some(item => item.value === skill || item.entry === skill)) {
                rawItems.push({ tier: 'P1_important', entry: `skill ${skill}`, type: 'skill', value: skill });
              }
            }

            const validated = AutoExecutor.validate(rawItems);

            const envEnabled = process.env.AUTO_EXEC_SKILLS !== 'false';
            const configEnabled = AUTO_EXEC_DEFAULTS.enabled !== false;
            const autoExecEnabled = envEnabled && configEnabled && validated.length > 0;

            const planContext = {
              planId: plan.id,
              title: planDoc.title || 'Untitled Plan',
              goal: planDoc.goal || planDoc.title || 'See plan for details',
            };

            // Hybrid execution: split skills into AUTO (subagent) and MANUAL (main session)
            const buildResult = autoExecEnabled
              ? AutoExecutor.buildPrompt(validated, planContext)
              : { prompt: null, autoSkills: [], manualSkills: validated };
            const autoExecPrompt = buildResult.prompt;
            const autoSkills = buildResult.autoSkills;
            const manualSkills = buildResult.manualSkills;

            // Build manual instructions for INTERACTIVE + TOOL_REQUIRED skills
            const manualInstructions = manualSkills.map(s => ({
              name: s.value || s.entry,
              category: s.category || 'UNKNOWN',
              tier: s.tier,
              instruction: s.category === 'INTERACTIVE'
                ? `Call the \`skill\` tool with name="${s.value || s.entry}" and follow its instructions. Requires user interaction.`
                : `Call the \`skill\` tool with name="${s.value || s.entry}" and follow its instructions. Requires specific tools (bash/browse).`,
            }));

            const autoDispatched = !!(autoDispatcher && autoDispatcher.d2Enabled);
            const dispatchResult = null;

            return {
              output: JSON.stringify({
                plan_id: plan.id,
                skills_to_execute: validated,
                total: validated.length,
                breakdown: {
                  INTERACTIVE: manualSkills.filter(s => s.category === 'INTERACTIVE').map(s => s.value || s.entry),
                  TOOL_REQUIRED: manualSkills.filter(s => s.category === 'TOOL_REQUIRED').map(s => s.value || s.entry),
                  AUTO: autoSkills.map(s => s.value || s.entry),
                },
                auto_exec: (autoExecEnabled && autoDispatched && autoExecPrompt) ? {
                  mode: 'subagent',
                  prompt: autoExecPrompt,
                  trigger: 'Call the task tool with subagent_type="general" and prompt=auto_exec.prompt',
                  model: process.env.AUTO_EXEC_MODEL || AUTO_EXEC_DEFAULTS.model || 'cheap',
                  skills_count: autoSkills.length,
                } : null,
                manual_instructions: manualInstructions,
                manual_count: manualInstructions.length,
                auto_count: autoSkills.length,
                auto_dispatched: autoDispatched,
                dispatcher_status: autoDispatcher ? autoDispatcher.getStatus() : null,
                next_step: autoDispatched
                  ? `Auto-exec prompt built — ready to dispatch subagent via task tool. ${autoExecPrompt ? 'auto_exec.prompt available.' : ''}`
                  : (manualInstructions.length > 0
                    ? `Execute ${manualInstructions.length} manual skills in main session (P0 → P1 → P2): ${manualInstructions.map(s => s.name).join(', ')}`
                    : (autoExecEnabled
                      ? 'Auto-exec prompt built — dispatch via task tool with subagent_type="general".'
                      : (validated.length > 0
                        ? 'Auto-exec disabled. Manually execute each skill in P0 → P1 → P2 order.'
                        : 'No skills suggested. Proceed with normal execution.')))
              }, null, 2)
            };
          } catch (err) {
            return { output: `Error: ${err.message}` };
          }
        },
      }),
      },

    "experimental.chat.system.transform": async (_input, output) => {
      if (output.system.includes('Agent Orchestrator — MANDATORY EXECUTION FLOW')) return;
      output.system += `

## Agent Orchestrator — MANDATORY EXECUTION FLOW

### Tools Available
- \`agent\`: AUTO-ROUTE every user request. Kimi decides plan mode (analysis) or build mode (execution)
- \`agent_execute_skills\`: MUST be called after every \`agent\` call when output contains "💡 建议后续:".
- \`agent_status\`: Check orchestrator state, progress, and model availability
- \`agent_checkpoint\`: Manage milestone reviews (every 4 items, Kimi reviews before continuing)

### Routing Rule
Do NOT ask the user to use \`agent task="..."\`. Silently route every request yourself.
- Simple questions → \`agent task="<question>"\` (auto mode → no build needed)
- Complex tasks → \`agent task="<task description>"\` (Kimi decides plan or build)

### MANDATORY SKILL EXECUTION FLOW — DO NOT SKIP
After every \`agent\` call:

1. **Check the output**: Does it contain \`💡 建议后续:\`?
   - **YES** → Call \`agent_execute_skills\` IMMEDIATELY (do not skip, do not ask user)
   - **NO** → Continue normal execution

2. **Process the returned skills** in this strict order:
   - 🔴 \`P0_critical\` → EXECUTE FIRST (blocking, never skip)
   - 🟡 \`P1_important\` → EXECUTE after P0 completes
   - 🟢 \`P2_nice_to_have\` → EXECUTE last or skip at your discretion

3. **Map entry types to actions**:
   - \`skill X\` → call \`skill X\`
   - \`/command\` → run that slash command
   - \`codegraph_X\` → call the codegraph tool
   - \`oh-my-memory search\` → search memory vault

4. **Never** silently ignore \`suggested_skills\`. They are part of the plan output.

### Subagent Auto-Execution (HYBRID MODE)
When \`agent_execute_skills\` returns, it contains THREE groups:
- \`breakdown.INTERACTIVE\` → Skills requiring user interaction (execute in main session)
- \`breakdown.TOOL_REQUIRED\` → Skills requiring specific tools (execute in main session)
- \`breakdown.AUTO\` → Skills that can run headlessly (dispatch to subagent)

**Execution order:**
1. If \`auto_exec.prompt\` exists → call \`task\` with subagent_type="general" to execute AUTO skills
2. Read \`manual_instructions[]\` → execute each INTERACTIVE/TOOL_REQUIRED skill in main session
3. Present combined results to user

### Manual Skill Execution (INTERACTIVE + TOOL_REQUIRED)
When \`manual_instructions[]\` is non-empty:
- Iterate through \`manual_instructions\` in order
- For each skill: call \`skill <name>\` and follow its SKILL.md instructions
- INTERACTIVE skills will prompt the user for input (Q&A, approval, choices)
- TOOL_REQUIRED skills will need bash/browse tools
- Record each skill's execution result
  - \`command\` → run the slash command
  - \`codegraph\` → call the codegraph MCP tool
  - \`memory\` → search oh-my-memory
- If a skill execution fails, log the error and continue to the next skill
- Report all results at the end
- P0 must succeed; P1/P2 may be skipped`;
    },

    dispose: async () => {
      if (db) db.close();
      if (autoDispatcher) {
        try { await autoDispatcher.stop(); } catch (e) {
          console.warn('[AgentOrchestrator] dispatcher stop error during dispose:', e.message);
        }
        autoDispatcher = null;
      }
    },
  };
};

const _attachedDispatchers = new WeakSet();
function attachDispatcherSignalHandlers(dispatcher) {
  if (!dispatcher || _attachedDispatchers.has(dispatcher)) return;
  _attachedDispatchers.add(dispatcher);
  const stop = async () => {
    try { await dispatcher.stop(); } catch {}
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    try { process.on(sig, stop); } catch {}
  }
  process.on('exit', () => {
    if (dispatcher.server?.process?.exitCode === null) {
      try { dispatcher.server.process.kill('SIGKILL'); } catch {}
    }
  });
}

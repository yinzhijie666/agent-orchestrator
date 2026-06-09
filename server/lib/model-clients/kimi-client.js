import BaseModelClient from "./base-client.js";

const CAPABILITY_LIST = `云端[76类]: frontend backend cloud security ai-ml testing database mobile devops
Superpowers[14]: brainstorming writing-plans executing-plans test-driven-development systematic-debugging subagent-driven-development verification-before-completion requesting-code-review receiving-code-review dispatching-parallel-agents finishing-a-development-branch using-git-worktrees using-superpowers writing-skills
GStack[16]: /qa /review /browse /ship /design-review /debug /retro /document-release /plan-eng-review /design-consultation /office-hours /plan-ceo-review /plan-design-review /qa-only /setup-browser-cookies /gstack-upgrade
本地: /understand-explain /understand-diff /understand-domain /understand-onboard /graphify query verify.sh oh-my-memory skills-manager
CodeGraph[9]: codegraph_context codegraph_search codegraph_node codegraph_explore codegraph_trace codegraph_callers codegraph_callees codegraph_impact codegraph_files`;

export { CAPABILITY_LIST };

class KimiClient extends BaseModelClient {
  constructor(config) {
    super(config);
  }

  async generatePlan(prompt, context = '', fallbackClient = null) {
    const messages = [
      {
        role: 'system',
        content: `You are an expert planning agent. Generate structured plan documents.

Each plan item must have:
- title: concise task title (max 100 chars)
- description: detailed task description
- executor: one of ['kimi', 'deepseek', 'zen']
- acceptance_criteria: how to verify this item is complete

可用能力（按 P0/P1/P2 优先级推荐 5-8 项到 "suggested_skills"）:
P0(必选): 与任务直接相关
P1(推荐): 增强质量
P2(可选): 验证/补充
${CAPABILITY_LIST}

Format your response as valid JSON with this structure:
{
  "title": "Plan title",
  "items": [
    {
      "title": "...",
      "description": "...",
      "executor": "...",
      "acceptance_criteria": "..."
    }
  ],
  "suggested_skills": {"P0_critical":["..."],"P1_important":["..."],"P2_nice_to_have":["..."]}
}`
      },
      {
        role: 'user',
        content: `Context: ${context}\n\nTask: ${prompt}\n\nGenerate a structured plan.`
      }
    ];

    const result = await this.chatWithFallback(messages, { json_mode: true, max_tokens: 8000 }, fallbackClient);
    const plan = this.parsePlan(result.content);
    plan._fallback = result._fallback;
    plan._fallback_reason = result._fallback_reason;
    return plan;
  }

  async analyzeTaskMode(task, context = '', fallbackClient = null) {
    const messages = [
      {
        role: 'system',
        content: `你是入口决策者。分析任务，决定模式：
- "plan": 只读分析/设计/研究/审查，不需要写代码
- "build": 需要编码/实现/测试/修复

可用能力（按 P0/P1/P2 优先级推荐 5-8 项）:
P0(必选): 与当前任务直接相关
P1(推荐): 增强质量
P2(可选): 验证/补充
${CAPABILITY_LIST}

返回 JSON: {"mode":"plan"|"build","reason":"选择原因","suggested_skills":{"P0_critical":["...","..."],"P1_important":["...","..."],"P2_nice_to_have":["...","..."]}}`
      },
      {
        role: 'user',
        content: `Task: ${task}\n\nContext: ${context || '无'}\n\n决定模式。`
      }
    ];

    const result = await this.chatWithFallback(messages, { json_mode: true, max_tokens: 1000 }, fallbackClient);
    const mode = JSON.parse(result.content);
    mode._fallback = result._fallback;
    mode._fallback_reason = result._fallback_reason;
    return mode;
  }

  async reviewCheckpoint(checkpoint, fallbackClient = null) {
    const cp = { ...checkpoint };
    if (typeof cp.agent_outputs === 'string') {
      try { cp.agent_outputs = JSON.parse(cp.agent_outputs); } catch {}
    }
    const messages = [
      {
        role: 'system',
        content: 'You are a review agent. Review checkpoint results and provide structured feedback.'
      },
      {
        role: 'user',
        content: `Review this checkpoint and return JSON:\n\n${JSON.stringify(cp, null, 2)}\n\nResponse format: {"status": "passed" | "failed", "feedback": "detailed review"}`
      }
    ];

    const result = await this.chatWithFallback(
      messages,
      { json_mode: true, max_tokens: 4000 },
      fallbackClient
    );
    return JSON.parse(result.content);
  }

  parsePlan(response) {
    try {
      const plan = JSON.parse(response);
      return {
        title: plan.title || 'Untitled Plan',
        items: (plan.items || []).map((item, idx) => ({
          idx,
          title: item.title || `Item ${idx + 1}`,
          description: item.description || '',
          executor: ['kimi', 'deepseek', 'zen'].includes(item.executor) ? item.executor : 'deepseek',
          acceptance_criteria: item.acceptance_criteria || '',
          status: 'pending'
        })),
        suggested_skills: (() => {
          const s = plan.suggested_skills;
          if (!s) return {};
          if (Array.isArray(s)) return { P1_important: s };
          if (s.P0_critical || s.P1_important || s.P2_nice_to_have) return s;
          return {};
        })()
      };
    } catch (err) {
      throw new Error(`Failed to parse plan JSON: ${err.message}. Raw: ${response.slice(0, 50)}...`);
    }
  }
}

export default KimiClient;
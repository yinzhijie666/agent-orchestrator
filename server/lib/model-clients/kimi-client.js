import BaseModelClient from "./base-client.js";

class KimiClient extends BaseModelClient {
  constructor(config) {
    super(config);
  }

  async generatePlan(prompt, context = '') {
    const messages = [
      {
        role: 'system',
        content: `You are an expert planning agent. Generate structured plan documents.

Each plan item must have:
- title: concise task title (max 100 chars)
- description: detailed task description
- executor: one of ['kimi', 'deepseek', 'minimax']
- acceptance_criteria: how to verify this item is complete

可用能力（推荐 3-5 项到 "suggested_skills"）:
云端[76类]: frontend backend cloud security ai-ml testing database mobile devops
Superpowers[14]: brainstorming test-driven-development systematic-debugging
GStack[16]: /qa /review /browse /ship /design-review
本地: /understand-explain /understand-diff /graphify query verify.sh oh-my-memory
CodeGraph[9]: codegraph_context codegraph_search codegraph_impact codegraph_explore

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
  "suggested_skills": ["skill A", "skill B"]
}`
      },
      {
        role: 'user',
        content: `Context: ${context}\n\nTask: ${prompt}\n\nGenerate a structured plan.`
      }
    ];

    const response = await this.chat(messages, { json_mode: true, max_tokens: 8000 });
    return this.parsePlan(response);
  }

  async analyzeTaskMode(task, context = '') {
    const messages = [
      {
        role: 'system',
        content: `你是入口决策者。分析任务，决定模式：
- "plan": 只读分析/设计/研究/审查，不需要写代码
- "build": 需要编码/实现/测试/修复

可用能力清单（推荐 3-5 项相关能力）:
云端技能[76类]: frontend backend cloud security ai-ml testing database mobile devops automation architecture
Superpowers[14]: brainstorming writing-plans test-driven-development systematic-debugging subagent-driven-development
GStack[16]: /browse /qa /review /ship /retro /debug /design-review /office-hours
本地: /understand-explain /understand-diff /graphify query verify.sh oh-my-memory
CodeGraph[9]: codegraph_context codegraph_search codegraph_impact codegraph_explore

返回 JSON: {"mode":"plan"|"build","reason":"选择原因","suggested_skills":["skill A","/command B"]}`
      },
      {
        role: 'user',
        content: `Task: ${task}\n\nContext: ${context || '无'}\n\n决定模式。`
      }
    ];

    const response = await this.chat(messages, { json_mode: true, max_tokens: 500 });
    return JSON.parse(response);
  }

  async reviewCheckpoint(checkpoint) {
    const messages = [
      {
        role: 'system',
        content: 'You are a review agent. Review checkpoint results and provide structured feedback.'
      },
      {
        role: 'user',
        content: `Review this checkpoint and return JSON:\n\n${JSON.stringify(checkpoint, null, 2)}\n\nResponse format: {"status": "passed" | "failed", "feedback": "detailed review"}`
      }
    ];

    const response = await this.chat(messages, { json_mode: true, max_tokens: 4000 });
    return JSON.parse(response);
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
          executor: ['kimi', 'deepseek', 'minimax'].includes(item.executor) ? item.executor : 'deepseek',
          acceptance_criteria: item.acceptance_criteria || '',
          status: 'pending'
        })),
        suggested_skills: plan.suggested_skills || []
      };
    } catch (err) {
      throw new Error(`Failed to parse plan JSON: ${err.message}. Raw: ${response.slice(0, 200)}`);
    }
  }
}

export default KimiClient;
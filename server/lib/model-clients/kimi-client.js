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
  ]
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

返回 JSON: {"mode":"plan"|"build","reason":"选择原因"}`
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
        }))
      };
    } catch (err) {
      throw new Error(`Failed to parse plan JSON: ${err.message}. Raw: ${response.slice(0, 200)}`);
    }
  }
}

export default KimiClient;
import BaseModelClient from "./base-client.js";

class DeepSeekClient extends BaseModelClient {
  constructor(config) {
    super(config);
  }

  async executeTask(task, context = '') {
    const messages = [
      {
        role: 'system',
        content: `You are an expert implementation agent. Execute tasks precisely and report results in JSON format.

Your response must be valid JSON with these fields:
- status: "completed" | "failed"
- result: detailed output of what was done
- deviations: any deviations from the plan (if any)

Be thorough but concise. Always report completion status.`
      },
      {
        role: 'user',
        content: `Task: ${task.title}\nDescription: ${task.description}\nAcceptance Criteria: ${task.acceptance_criteria}\n\nContext: ${context}\n\nExecute this task and report results.`
      }
    ];

    const response = await this.chat(messages, { json_mode: true, max_tokens: 12000 });
    return this.parseExecutionResult(response);
  }

  async generateCode(specification, language = 'javascript') {
    const messages = [
      {
        role: 'system',
        content: `You are an expert ${language} developer. Write clean, well-documented code.`
      },
      {
        role: 'user',
        content: `Specification: ${specification}\n\nGenerate ${language} code.`
      }
    ];

    return await this.chat(messages, { max_tokens: 16000 });
  }

  parseExecutionResult(response) {
    try {
      const result = JSON.parse(response);
      return {
        status: result.status || 'completed',
        result: result.result || response,
        deviations: result.deviations || []
      };
    } catch {
      return {
        status: 'completed',
        result: response,
        deviations: []
      };
    }
  }
}

export default DeepSeekClient;
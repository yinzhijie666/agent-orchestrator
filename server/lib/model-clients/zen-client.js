import BaseModelClient from "./base-client.js";

class ZenClient extends BaseModelClient {
  constructor(config) {
    super(config);
  }

  // Read-only operations
  async searchCode(query, codebase = '') {
    const messages = [
      {
        role: 'system',
        content: 'You are an information retrieval agent. Search and summarize information accurately.'
      },
      {
        role: 'user',
        content: `Query: ${query}\n\nCodebase context (if available): ${codebase.slice(0, 2000)}\n\nProvide a concise, accurate answer.`
      }
    ];

    return await this.chat(messages, { max_tokens: 4000 });
  }

  async readFileSummary(filePath, content = '') {
    const messages = [
      {
        role: 'system',
        content: 'Summarize code files concisely. Focus on: purpose, key functions, dependencies.'
      },
      {
        role: 'user',
        content: `File: ${filePath}\n\nContent:\n${content.slice(0, 4000)}\n\nProvide a brief summary.`
      }
    ];

    return await this.chat(messages, { max_tokens: 2000 });
  }

  async batchQuery(queries) {
    const promises = queries.map(q => this.searchCode(q));
    return await Promise.all(promises);
  }

  // Full task execution (read-only analysis, search, documentation, research)
  async executeTask(task, context = '') {
    const messages = [
      {
        role: 'system',
        content: `You are an expert research and analysis agent. Execute tasks precisely and report results in JSON format.

Your response must be valid JSON with these fields:
- status: "completed" | "failed"
- result: detailed output of what was found or analyzed
- notes: any caveats or limitations

Focus on: research, analysis, information gathering, documentation, and search.
Do NOT modify code or the filesystem.`
      },
      {
        role: 'user',
        content: `Task: ${task.title}\nDescription: ${task.description}\nAcceptance Criteria: ${task.acceptance_criteria}\n\nContext: ${context}\n\nExecute this research/analysis task and report results.`
      }
    ];

    const response = await this.chat(messages, { json_mode: true, max_tokens: 12000 });
    return this.parseExecutionResult(response);
  }

  parseExecutionResult(response) {
    try {
      const result = JSON.parse(response);
      return {
        status: result.status || 'completed',
        result: result.result || response,
        notes: result.notes || []
      };
    } catch {
      return {
        status: 'completed',
        result: response,
        notes: []
      };
    }
  }

  static isReadOnly() {
    return true;
  }

  writeForbidden() {
    throw new Error('Zen agent is read-only. Write operations are forbidden.');
  }
}

export default ZenClient;

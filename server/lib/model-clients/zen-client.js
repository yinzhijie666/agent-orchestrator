import BaseModelClient from "./base-client.js";

class ZenClient extends BaseModelClient {
  constructor(config) {
    super(config);
  }

  // Read-only operations only
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
    // Process multiple queries in parallel
    const promises = queries.map(q => this.searchCode(q));
    return await Promise.all(promises);
  }

  // Zen agent is read-only - no write operations
  static isReadOnly() {
    return true;
  }

  writeForbidden() {
    throw new Error('Zen agent is read-only. Write operations are forbidden.');
  }
}

export default ZenClient;

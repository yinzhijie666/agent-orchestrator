// Direct LLM-based subagent dispatcher.
// Bypasses `opencode run` (which has a Session not found bug in 1.15.13) and
// dispatches subagent prompts to a model client directly via the existing
// BaseModelClient. This is the D1 path of the AutoDispatcher.

import DeepSeekClient from "./model-clients/deepseek-client.js";
import MiniMaxClient from "./model-clients/minimax-client.js";

const MODEL_MAP = {
  deepseek: (config) => new DeepSeekClient(config.models.deepseek),
  minimax: (config) => new MiniMaxClient(config.models.minimax),
  cheap: (config) => new MiniMaxClient(config.models.minimax),
  default: (config) => new MiniMaxClient(config.models.minimax),
};

function pickClient(config, modelName) {
  const factory = MODEL_MAP[modelName] || MODEL_MAP.default;
  return factory(config);
}

const SUBAGENT_SYSTEM_PROMPT = `You are a subagent executing a list of skills. The orchestrator has already
collected, prioritized, and grouped the work for you. Your job is to execute each
skill in tier order (P0 → P1 → P2) and report results as JSON.

Execution rules:
- P0 items: must all succeed; if any P0 fails, report failure and stop.
- P1 items: try, but skip on failure and continue.
- P2 items: optional, may skip.
- Do NOT call the orchestrator's "agent" or "agent_execute_skills" tool (recursion prevention).
- If a skill requires an external tool you do not have, report it as skipped with reason.

Output schema (strict JSON, no markdown fencing):
{
  "status": "success" | "partial" | "failure",
  "executed_skills": [
    {
      "name": "<skill name>",
      "type": "<skill type>",
      "tier": "P0" | "P1" | "P2",
      "result": "completed" | "failed" | "skipped",
      "output": "<concise summary of result>",
      "error": "<error message if failed>"
    }
  ],
  "p0_failures": ["<skill names that failed at P0>"],
  "summary": "<one-sentence human summary>"
}`;

export class SubagentRunner {
  constructor(config) {
    this.config = config;
    this.defaultTimeoutMs = config?.auto_exec?.timeout_ms || 90000;
    this.deepseekClient = new DeepSeekClient(config.models.deepseek);
  }

  async run(prompt, options = {}) {
    const modelName = options.model || this.config?.auto_exec?.model || "cheap";
    const client = options.client || pickClient(this.config, modelName);
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;

    const fallbackClient = options.fallbackClient
      || (client.provider === "minimax" ? this.deepseekClient : null);

    const messages = [
      { role: "system", content: SUBAGENT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];

    const t0 = Date.now();
    const result = await this._chatWithTimeout(client, messages, {
      json_mode: true,
      max_tokens: options.maxTokens || 8000,
    }, timeoutMs, fallbackClient);
    const durationMs = Date.now() - t0;

    const parsed = this._parseResult(result.content);

    return {
      status: parsed.status,
      mode: "llm",
      model: result._model || client.model,
      provider: result._provider || client.provider,
      fallback: !!result._fallback,
      executed_skills: parsed.executed_skills || [],
      p0_failures: parsed.p0_failures || [],
      summary: parsed.summary || "",
      output: parsed,
      rawContent: result.content,
      durationMs,
    };
  }

  async _chatWithTimeout(client, messages, options, timeoutMs, fallbackClient = null) {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`subagent LLM call timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      const result = await Promise.race([
        client.chatWithFallback(messages, options, fallbackClient),
        timeoutPromise,
      ]);
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  _parseResult(content) {
    if (!content || typeof content !== "string") {
      return {
        status: "failure",
        executed_skills: [],
        p0_failures: [],
        summary: "subagent returned empty content",
      };
    }
    let text = content.trim();

    if (text.startsWith("```")) {
      const m = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
      if (m) text = m[1];
    }

    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      text = text.slice(jsonStart, jsonEnd + 1);
    }

    try {
      const parsed = JSON.parse(text);
      if (!parsed.status) {
        parsed.status = parsed.p0_failures?.length ? "failure" : "success";
      }
      if (!Array.isArray(parsed.executed_skills)) parsed.executed_skills = [];
      if (!Array.isArray(parsed.p0_failures)) parsed.p0_failures = [];
      if (!parsed.summary) parsed.summary = "";
      return parsed;
    } catch (e) {
      return {
        status: "failure",
        executed_skills: [],
        p0_failures: [],
        summary: `subagent returned non-JSON content: ${text.slice(0, 200)}`,
        _parseError: e.message,
        _rawContent: text.slice(0, 2000),
      };
    }
  }
}

export default SubagentRunner;

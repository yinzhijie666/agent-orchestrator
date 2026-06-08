// AutoDispatcher — unified entry point for subagent auto-execution.
// Strategy: prefer D2 (long-lived opencode server) when healthy, fall back to D1
// (SubagentRunner → LLM API directly).
//
// As of opencode 1.15.13, the `opencode run --attach` command also triggers
// the same "Session not found" bug, so D2 is currently a no-op (server starts
// for monitoring/observability but dispatch goes through D1). The D2 path is
// preserved for when upstream fixes the bug.

import { SubagentRunner, SUBAGENT_SYSTEM_PROMPT, parseSubagentResult } from "./subagent-runner.js";
import { OpencodeServer } from "./opencode-server.js";

export class AutoDispatcher {
  constructor(config) {
    this.config = config;
    this.runner = new SubagentRunner(config);
    this.server = null;
    this.d2Enabled = false;
    this.dispatchedTotal = 0;
    this.dispatchedByMode = { llm: 0, server: 0, fallback: 0 };
    this.restartAttempts = 0;
    this._maxRestartAttempts = 3;
  }

  async start() {
    if (!this._isServerPreferred()) {
      return { started: false, reason: "D2 not preferred by config" };
    }
    try {
      this.server = new OpencodeServer({
        portRange: this.config?.auto_exec?.dispatcher?.server?.port_range || [14096, 14097, 14098, 14099],
        startupTimeoutMs: this.config?.auto_exec?.dispatcher?.server?.startup_timeout_ms || 15000,
        usePure: this.config?.auto_exec?.dispatcher?.server?.use_pure !== false,
        binary: "opencode",
      });
      const info = await this.server.start();
      this.d2Enabled = true;
      console.log(`[AutoDispatcher] D2 server started: ${info.url} (pid=${info.pid})`);
      return { started: true, ...info };
    } catch (e) {
      this.d2Enabled = false;
      this.server = null;
      console.warn(`[AutoDispatcher] D2 server failed to start, will use D1: ${e.message}`);
      return { started: false, error: e.message };
    }
  }

  async dispatch(prompt, options = {}) {
    this.dispatchedTotal += 1;

    if (!this.d2Enabled) {
      const result = await this.runner.run(prompt, options);
      this.dispatchedByMode.llm += 1;
      return { ...result, _mode: "llm" };
    }

    const health = await this.ensureHealthy();
    if (health.ok && this.server && this.server.isHealthy()) {
      try {
        const result = await this._dispatchViaServer(prompt, options);
        if (result.status !== "failure") {
          this.dispatchedByMode.server += 1;
          return { ...result, _mode: "server" };
        }
        console.warn(`[AutoDispatcher] D2 returned failure, falling back to D1`);
      } catch (e) {
        console.warn(`[AutoDispatcher] D2 dispatch threw, falling back to D1: ${e.message}`);
      }
    }

    this.dispatchedByMode.fallback += 1;
    const result = await this.runner.run(prompt, options);
    return { ...result, _mode: "llm", _fell_back_from_d2: true };
  }

  async ensureHealthy() {
    if (!this._isServerPreferred()) {
      return { ok: true, reason: "D2 not required by config (prefer=run/disabled)" };
    }
    if (this.server && this.server.isHealthy()) {
      this.restartAttempts = 0;
      return { ok: true, restarted: false };
    }
    if (this.restartAttempts >= this._maxRestartAttempts) {
      console.warn(`[AutoDispatcher] Max restart attempts (${this._maxRestartAttempts}) reached, disabling D2`);
      this.d2Enabled = false;
      return { ok: false, reason: "max restart attempts reached", restartAttempts: this.restartAttempts };
    }
    this.restartAttempts += 1;
    console.log(`[AutoDispatcher] Server unhealthy, attempting restart ${this.restartAttempts}/${this._maxRestartAttempts}`);
    if (this.server) {
      try { await this.server.stop(); } catch (e) {
        console.warn(`[AutoDispatcher] Old server stop during restart: ${e.message}`);
      }
      this.server = null;
    }
    try {
      this.server = new OpencodeServer({
        portRange: this.config?.auto_exec?.dispatcher?.server?.port_range || [14096, 14097, 14098, 14099],
        startupTimeoutMs: this.config?.auto_exec?.dispatcher?.server?.startup_timeout_ms || 15000,
        usePure: this.config?.auto_exec?.dispatcher?.server?.use_pure !== false,
        binary: "opencode",
      });
      const info = await this.server.start();
      this.d2Enabled = true;
      return { ok: true, restarted: true, ...info, restartAttempts: this.restartAttempts };
    } catch (e) {
      this.d2Enabled = false;
      this.server = null;
      return { ok: false, error: e.message, restartAttempts: this.restartAttempts };
    }
  }

  async _dispatchViaServer(prompt, options = {}) {
    if (!this.server || !this.server.url) {
      throw new Error("D2 server not available");
    }

    const messages = [
      { role: "system", content: SUBAGENT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];

    const body = JSON.stringify({
      model: options.model || "default",
      messages,
      stream: false,
      response_format: { type: "json_object" },
      max_tokens: options.maxTokens || 8000,
    });

    const t0 = Date.now();
    let response;
    try {
      response = await fetch(`${this.server.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(options.timeoutMs || 60000),
      });
    } catch (err) {
      throw new Error(`D2 HTTP call failed: ${err.message}`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`D2 server returned ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const durationMs = Date.now() - t0;
    const parsed = parseSubagentResult(content);

    return {
      status: parsed.status,
      mode: "server",
      model: data?.model || "unknown",
      provider: "opencode-server",
      fallback: false,
      executed_skills: parsed.executed_skills || [],
      p0_failures: parsed.p0_failures || [],
      summary: parsed.summary || "",
      output: parsed,
      rawContent: content,
      durationMs,
    };
  }

  async stop() {
    if (!this.server) {
      return { stopped: false, reason: "no server" };
    }
    try {
      const result = await this.server.stop();
      this.d2Enabled = false;
      this.server = null;
      return { stopped: true, ...result };
    } catch (e) {
      this.d2Enabled = false;
      this.server = null;
      return { stopped: false, error: e.message };
    }
  }

  getStatus() {
    return {
      d2Enabled: this.d2Enabled,
      d2Url: this.server?.url || null,
      d2Port: this.server?.port || null,
      d2Healthy: this.server?.isHealthy() || false,
      dispatchedTotal: this.dispatchedTotal,
      dispatchedByMode: { ...this.dispatchedByMode },
    };
  }

  _isServerPreferred() {
    const pref = this.config?.auto_exec?.dispatcher?.prefer || "auto";
    return pref === "auto" || pref === "server";
  }
}

export default AutoDispatcher;

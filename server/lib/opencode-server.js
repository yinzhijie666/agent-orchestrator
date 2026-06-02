import { spawn } from "bun";
import { findFreePort, isPortFree } from "./network-utils.js";

const DEFAULT_PORT_RANGE = [14096, 14097, 14098, 14099];
const HEALTH_CHECK_TIMEOUT_MS = 15000;
const HEALTH_CHECK_INTERVAL_MS = 500;
const SERVER_STARTUP_GRACE_MS = 2000;
const MAX_INSTANCES = 64;
const _serverRegistry = new Set();
let _signalHandlersAttached = false;

function attachGlobalSignalHandlers() {
  if (_signalHandlersAttached) return;
  _signalHandlersAttached = true;
  const cleanup = (sig) => {
    for (const server of _serverRegistry) {
      try { if (server.process && server.process.exitCode === null) server.process.kill(sig); } catch {}
    }
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    try { process.on(sig, () => cleanup(sig)); } catch {}
  }
  process.on('exit', () => {
    for (const server of _serverRegistry) {
      try { if (server.process && server.process.exitCode === null) server.process.kill('SIGKILL'); } catch {}
    }
  });
}

export class OpencodeServer {
  constructor(options = {}) {
    this.portRange = options.portRange || DEFAULT_PORT_RANGE;
    this.startupTimeoutMs = options.startupTimeoutMs || HEALTH_CHECK_TIMEOUT_MS;
    this.usePure = options.usePure !== false;
    this.binary = options.binary || "opencode";
    this.logLevel = options.logLevel || "WARN";
    this.printLogs = options.printLogs || false;
    this.process = null;
    this.port = null;
    this.host = "127.0.0.1";
    this.url = null;
    this.startedAt = null;
    this.lastHealthCheck = null;
    this._healthCache = { ok: false, checkedAt: 0 };
  }

  async start() {
    const port = await this._pickPort();
    if (port === null) {
      throw new Error(
        `No free port in range ${this.portRange.join(", ")} for opencode server`
      );
    }

    const args = [
      "serve",
      "--port",
      String(port),
      "--hostname",
      this.host,
      "--pure",
      "--log-level",
      this.logLevel,
    ];

    if (this.printLogs) {
      args.push("--print-logs");
    }

    this.process = spawn({
      cmd: [this.binary, ...args],
      stdout: this.printLogs ? "inherit" : "pipe",
      stderr: this.printLogs ? "inherit" : "pipe",
      env: { ...process.env },
    });

    attachGlobalSignalHandlers();
    if (_serverRegistry.size >= MAX_INSTANCES) {
      const oldest = _serverRegistry.values().next().value;
      _serverRegistry.delete(oldest);
    }
    _serverRegistry.add(this);

    this.port = port;
    this.url = `http://${this.host}:${port}`;
    this.startedAt = Date.now();

    if (!this.printLogs) {
      this._drainStderr();
    }

    await new Promise((r) => setTimeout(r, SERVER_STARTUP_GRACE_MS));

    const healthy = await this.waitForHealthy();
    if (!healthy) {
      await this._forceKill();
      throw new Error(
        `opencode server did not become healthy within ${this.startupTimeoutMs}ms on port ${port}`
      );
    }

    return {
      url: this.url,
      port: this.port,
      pid: this.process.pid,
      startedAt: this.startedAt,
    };
  }

  async stop() {
    if (!this.process) return { stopped: false, reason: "not running" };
    return await this._forceKill();
  }

  isHealthy() {
    if (!this.process || this.process.exitCode !== null || this.url === null) {
      return false;
    }
    return this._cachedProbe();
  }

  _cachedProbe(ttlMs = 500) {
    const now = Date.now();
    if (now - this._healthCache.checkedAt < ttlMs) {
      return this._healthCache.ok;
    }
    let ok = false;
    try {
      const res = Bun.spawnSync({
        cmd: ["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "-m", "1", this.url],
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = Number(res.stdout.toString().trim());
      ok = code > 0;
    } catch {
      ok = false;
    }
    this._healthCache = { ok, checkedAt: now };
    return ok;
  }

  invalidateHealth() {
    this._healthCache = { ok: false, checkedAt: 0 };
  }

  async waitForHealthy(timeoutMs = this.startupTimeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.process.exitCode !== null) {
        return false;
      }
      const ok = await this._probe();
      if (ok) {
        this.lastHealthCheck = Date.now();
        return true;
      }
      await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
    }
    return false;
  }

  async _probe() {
    if (!this.url) return false;
    try {
      const res = await fetch(this.url, {
        method: "GET",
        signal: AbortSignal.timeout(1000),
      });
      return res.status > 0;
    } catch {
      return false;
    }
  }

  async _pickPort() {
    for (const port of this.portRange) {
      if (await isPortFree(port, this.host)) {
        return port;
      }
    }
    return null;
  }

  _drainStderr() {
    if (!this.process || !this.process.stderr) return;
    const reader = this.process.stderr.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 4096) {
            buffer = buffer.slice(-2048);
          }
        }
      } catch {}
    };
    pump();
  }

  async _forceKill() {
    if (!this.process) {
      return { stopped: true, reason: "no process" };
    }
    const pid = this.process.pid;
    try {
      this.process.kill("SIGTERM");
      const exited = await Promise.race([
        this.process.exited,
        new Promise((r) => setTimeout(() => r(false), 3000)),
      ]);
      if (!exited) {
        this.process.kill("SIGKILL");
        await this.process.exited.catch(() => {});
      }
    } catch (e) {
      try {
        this.process.kill("SIGKILL");
      } catch {}
    }
    const wasRunning = this.process.exitCode === null || this.process.exitCode === undefined;
    this.process = null;
    _serverRegistry.delete(this);
    return { stopped: true, pid, wasRunning };
  }
}

export default OpencodeServer;

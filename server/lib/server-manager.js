import { spawn } from "bun";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");
const PID_FILE = join(__dirname, "..", "state", "coordinator.pid");
const HEALTH_CHECK_INTERVAL_MS = 500;
const STARTUP_TIMEOUT_MS = 15000;
const STOP_TIMEOUT_MS = 3000;
const MAX_RESTART_ATTEMPTS = 3;

let _globalManager = null;

export class ServerManager {
  constructor(options = {}) {
    this.port = options.port || parseInt(process.env.AGENT_ORCHESTRATOR_PORT) || 8765;
    this.host = options.host || "127.0.0.1";
    this.url = `http://${this.host}:${this.port}`;
    this.maxRestartAttempts = options.maxRestartAttempts != null ? options.maxRestartAttempts : MAX_RESTART_ATTEMPTS;
    this.binary = options.binary || "bun";
    this.scriptPath = options.scriptPath || join(PROJECT_ROOT, "server", "index.js");
    this.process = null;
    this.restartCount = 0;
    this._startedAt = null;
    this._explicitStop = false;
  }

  get pid() {
    return this.process?.pid || null;
  }

  get uptime() {
    return this._startedAt ? Date.now() - this._startedAt : 0;
  }

  async start() {
    if (_globalManager && _globalManager !== this) {
      console.log(`[ServerManager] Global server already managed, skipping`);
      return { pid: _globalManager.pid, url: this.url, port: this.port, external: true };
    }

    const { isPortFree } = await import("./network-utils.js");
    const free = await isPortFree(this.port, this.host);
    if (!free) {
      const healthy = await this._probe();
      if (healthy) {
        _globalManager = this;
        console.log(`[ServerManager] Port ${this.port} already has healthy server, adopting`);
        return { pid: null, url: this.url, port: this.port, external: true };
      }
      // Port in TIME_WAIT or zombie — wait for release (up to 5s)
      console.log(`[ServerManager] Port ${this.port} in use but unhealthy, waiting for release...`);
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (await isPortFree(this.port, this.host)) break;
      }
    }

    this._explicitStop = false;
    const dir = dirname(PID_FILE);
    if (dir && dir !== "." && dir !== "/") {
      try { mkdirSync(dir, { recursive: true }); } catch {}
    }

    this.process = spawn({
      cmd: [this.binary, this.scriptPath],
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        AGENT_ORCHESTRATOR_PORT: String(this.port),
      },
    });

    _globalManager = this;
    this._writePid(this.process.pid);
    this._startedAt = Date.now();

    this._drainStdout();
    this._drainStderr();
    this._watchExit();

    const healthy = await this._waitForHealthy();
    if (!healthy) {
      await this._forceKill();
      throw new Error(`Coordinator server did not become healthy within ${STARTUP_TIMEOUT_MS}ms on port ${this.port}`);
    }

    console.log(`[ServerManager] Server started: pid=${this.process.pid} url=${this.url}`);
    return { pid: this.process.pid, url: this.url, port: this.port };
  }

  async stop() {
    this._explicitStop = true;
    if (_globalManager !== this) return { stopped: false, reason: "not active manager" };
    if (!this.process) return { stopped: false, reason: "not running" };
    const result = await this._forceKill();
    _globalManager = null;
    return result;
  }

  isHealthy() {
    if (!this.process || this.process.exitCode !== null || this.process.killed) return false;
    return true;
  }

  getStatus() {
    return {
      running: this.isHealthy(),
      pid: this.pid,
      url: this.url,
      port: this.port,
      uptime: this.uptime,
      restartCount: this.restartCount,
    };
  }

  async _waitForHealthy(timeoutMs = STARTUP_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.process.exitCode !== null) return false;
      if (await this._probe()) return true;
      await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
    }
    return false;
  }

  async _probe() {
    try {
      const res = await fetch(`${this.url}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async _forceKill() {
    if (!this.process) return { stopped: true, reason: "no process" };
    const pid = this.process.pid;
    try {
      this.process.kill("SIGTERM");
      const exited = await Promise.race([
        this.process.exited,
        new Promise(r => setTimeout(() => r(false), STOP_TIMEOUT_MS)),
      ]);
      if (!exited) {
        this.process.kill("SIGKILL");
        await this.process.exited.catch(() => {});
      }
    } catch {
      try { this.process.kill("SIGKILL"); } catch {}
    }
    this._removePid();
    this.process = null;
    console.log(`[ServerManager] Server stopped: pid=${pid}`);
    return { stopped: true, pid };
  }

  _writePid(pid) {
    try { writeFileSync(PID_FILE, String(pid)); } catch (e) {
      console.warn(`[ServerManager] Failed to write pid file: ${e.message}`);
    }
  }

  _removePid() {
    try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch {}
  }

  _drainStdout() {
    if (!this.process?.stdout) return;
    const reader = this.process.stdout.getReader();
    const decoder = new TextDecoder();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          process.stdout.write(`[coordinator] ${decoder.decode(value, { stream: true })}`);
        }
      } catch {}
    };
    pump();
  }

  _drainStderr() {
    if (!this.process?.stderr) return;
    const reader = this.process.stderr.getReader();
    const decoder = new TextDecoder();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          process.stderr.write(`[coordinator] ${decoder.decode(value, { stream: true })}`);
        }
      } catch {}
    };
    pump();
  }

  _watchExit() {
    if (!this.process) return;
    this.process.exited.then(async (code) => {
      if (this._explicitStop) return;
      console.warn(`[ServerManager] Server exited unexpectedly (code=${code}), restart ${this.restartCount + 1}/${this.maxRestartAttempts}`);
      this._removePid();
      if (this.restartCount < this.maxRestartAttempts) {
        this.restartCount++;
        _globalManager = null;
        await this.start().catch(e => {
          console.error(`[ServerManager] Restart failed: ${e.message}`);
        });
      } else {
        console.error(`[ServerManager] Max restart attempts (${this.maxRestartAttempts}) reached, giving up`);
      }
    }).catch(() => {});
  }
}

export default ServerManager;

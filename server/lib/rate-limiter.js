const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_WINDOW_MS = 60000;

export class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || parseInt(process.env.AGENT_ORCHESTRATOR_RATE_LIMIT) || DEFAULT_MAX_REQUESTS;
    this.windowMs = options.windowMs || DEFAULT_WINDOW_MS;
    this.clients = new Map();
    this._cleanupInterval = setInterval(() => this._cleanup(), this.windowMs * 2);
  }

  check(clientKey) {
    const now = Date.now();
    let record = this.clients.get(clientKey);

    if (!record || now - record.windowStart > this.windowMs) {
      record = { windowStart: now, count: 0 };
      this.clients.set(clientKey, record);
    }

    record.count++;
    const remaining = Math.max(0, this.maxRequests - record.count);
    const allowed = record.count <= this.maxRequests;
    const retryAfter = allowed ? 0 : Math.ceil((record.windowStart + this.windowMs - now) / 1000);

    return { allowed, remaining, retryAfter, limit: this.maxRequests };
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, record] of this.clients) {
      if (now - record.windowStart > this.windowMs) {
        this.clients.delete(key);
      }
    }
  }

  close() {
    if (this._cleanupInterval) clearInterval(this._cleanupInterval);
    this.clients.clear();
  }
}

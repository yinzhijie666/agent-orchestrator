const STATE = { CLOSED: "CLOSED", OPEN: "OPEN", HALF_OPEN: "HALF_OPEN" };

export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 3;
    this.resetTimeoutMs = options.resetTimeoutMs || 30000;
    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this._resetTimer = null;
    this.lastFailureTime = null;
  }

  async call(action) {
    if (this.state === STATE.OPEN) {
      if (this._shouldAttemptReset()) {
        this._transitionTo(STATE.HALF_OPEN);
      } else {
        return null;
      }
    }

    try {
      const result = await action();
      if (this.state === STATE.HALF_OPEN) {
        this.recordSuccess();
      }
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this._transitionTo(STATE.OPEN);
    }
  }

  recordSuccess() {
    this.failureCount = 0;
    if (this.state === STATE.HALF_OPEN) {
      this._transitionTo(STATE.CLOSED);
    }
  }

  _transitionTo(newState) {
    this.state = newState;
    if (newState === STATE.OPEN) {
      this._scheduleReset();
    }
    if (newState === STATE.CLOSED) {
      this._cancelReset();
    }
  }

  _scheduleReset() {
    this._cancelReset();
    this._resetTimer = setTimeout(() => {
      this._transitionTo(STATE.HALF_OPEN);
    }, this.resetTimeoutMs);
  }

  _cancelReset() {
    if (this._resetTimer) {
      clearTimeout(this._resetTimer);
      this._resetTimer = null;
    }
  }

  _shouldAttemptReset() {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.resetTimeoutMs;
  }

  isOpen() {
    return this.state === STATE.OPEN;
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      resetTimeoutMs: this.resetTimeoutMs,
    };
  }
}

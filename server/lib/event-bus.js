export class EventBus {
  #listeners = new Map();
  #history = [];

  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, []);
    this.#listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const fns = this.#listeners.get(event);
    if (!fns) return;
    const idx = fns.indexOf(fn);
    if (idx !== -1) fns.splice(idx, 1);
  }

  emit(event, data) {
    this.#history.push({ event, data, ts: Date.now() });
    if (this.#history.length > 100) this.#history.shift();
    const fns = this.#listeners.get(event);
    if (!fns || fns.length === 0) return;
    for (const fn of fns) {
      try { fn(data); } catch (e) {
        console.warn(`[EventBus] handler error for "${event}":`, e);
      }
    }
  }

  get history() { return this.#history; }
  clearHistory() { this.#history = []; }
}

export default EventBus;

class Counter {
  constructor(registry, name, help, labelNames) {
    this.registry = registry;
    this.name = name;
    this.help = help;
    this.labelNames = labelNames || [];
    if (this.labelNames.length === 0) {
      this._value = 0;
    }
    this._labeled = new Map();
  }

  inc(n = 1) {
    if (this.labelNames.length > 0) return this;
    this._value += n;
    return this;
  }

  value() {
    if (this.labelNames.length > 0) return 0;
    return this._value;
  }

  labels(labels) {
    const key = JSON.stringify(labels);
    if (!this._labeled.has(key)) {
      const inner = { _value: 0, _labels: labels };
      this._labeled.set(key, inner);
    }
    const entry = this._labeled.get(key);
    return {
      inc: (n = 1) => { entry._value += n; },
      value: () => entry._value,
    };
  }

  _collect() {
    if (this.labelNames.length === 0) {
      return [{ labels: {}, value: this._value }];
    }
    return Array.from(this._labeled.values()).map(e => ({
      labels: e._labels,
      value: e._value,
    }));
  }
}

class Gauge {
  constructor(registry, name, help) {
    this.name = name;
    this.help = help;
    this._value = 0;
    this._labeled = new Map();
  }

  set(v) { this._value = v; return this; }
  inc(n = 1) { this._value += n; return this; }
  dec(n = 1) { this._value -= n; return this; }
  value() { return this._value; }

  labels(labels) {
    const key = JSON.stringify(labels);
    if (!this._labeled.has(key)) {
      this._labeled.set(key, { _value: 0, _labels: labels });
    }
    const entry = this._labeled.get(key);
    return {
      set: (v) => { entry._value = v; },
      inc: (n = 1) => { entry._value += n; },
      dec: (n = 1) => { entry._value -= n; },
      value: () => entry._value,
    };
  }

  _collect() {
    if (this._labeled.size === 0) {
      return [{ labels: {}, value: this._value }];
    }
    const results = [];
    if (this._value !== 0) results.push({ labels: {}, value: this._value });
    for (const e of this._labeled.values()) {
      results.push({ labels: e._labels, value: e._value });
    }
    return results;
  }
}

export class MetricsRegistry {
  constructor() {
    this._counters = new Map();
    this._gauges = new Map();
  }

  counter(name, help, labelNames) {
    if (!this._counters.has(name)) {
      this._counters.set(name, new Counter(this, name, help, labelNames));
    }
    return this._counters.get(name);
  }

  gauge(name, help) {
    if (!this._gauges.has(name)) {
      this._gauges.set(name, new Gauge(this, name, help));
    }
    return this._gauges.get(name);
  }

  prometheus() {
    const lines = [];

    for (const c of this._counters.values()) {
      const samples = c._collect();
      if (samples.length === 0) continue;
      lines.push(`# HELP ${c.name} ${c.help}`);
      lines.push(`# TYPE ${c.name} counter`);
      for (const s of samples) {
        if (s.value === 0 && s.labels && Object.keys(s.labels).length > 0) continue;
        const labels = formatLabels(s.labels);
        lines.push(`${c.name}${labels} ${s.value}`);
      }
    }

    for (const g of this._gauges.values()) {
      const samples = g._collect();
      if (samples.length === 0) continue;
      lines.push(`# HELP ${g.name} ${g.help}`);
      lines.push(`# TYPE ${g.name} gauge`);
      for (const s of samples) {
        const labels = formatLabels(s.labels);
        lines.push(`${g.name}${labels} ${s.value}`);
      }
    }

    return lines.join("\n") + "\n";
  }
}

function formatLabels(labels) {
  const keys = Object.keys(labels);
  if (keys.length === 0) return "";
  const parts = keys.map(k => `${k}="${labels[k]}"`);
  return `{${parts.join(",")}}`;
}

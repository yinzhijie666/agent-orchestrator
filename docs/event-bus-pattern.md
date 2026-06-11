# EventBus Pattern — 解耦式事件总线

## 问题

日志、监控、审计代码散落在业务逻辑中：
- 底层模块调用后，上层要检查返回值才能知道发生了 fallback
- 一个操作需要同时写 DB 日志 + console.log + metrics → 三种代码耦合在一起
- 业务逻辑修改时容易忘记更新对应的日志

## EventBus 方案

30 行的零依赖事件总线，将"事件发生"与"事件处理"解耦。

### 核心实现

```javascript
export class EventBus {
  #listeners = new Map();
  #history = [];

  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, []);
    this.#listeners.get(event).push(fn);
    return () => this.off(event, fn); // 返回取消函数
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
```

### 使用模式

```
OnEvent Bus

┌──────────────┐   emit('model_fallback', data)
│ SubagentRunner│─────────────────────────────►┌────────────┐
│ (底层模块)    │                              │  EventBus   │
└──────────────┘                               └─────┬──────┘
                                                     │
                    ┌─────────────────────────────────┼──────────────────┐
                    │                                 │                  │
                    ▼                                 ▼                  ▼
             ┌──────────────┐              ┌──────────────┐   ┌──────────────┐
             │ db.logActivity│              │ console.warn │   │ metrics.inc  │
             │ (审计追踪)    │              │ (报警)       │   │ (监控)       │
             └──────────────┘              └──────────────┘   └──────────────┘
```

### 关键设计决策

| 决策                       | 理由                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `#listeners` 用 `Map`          | 比对象更高效，无原型链污染                                  |
| `emit` catch handler 异常     | 防止一个 handler 崩溃影响其他 handler 或主流程              |
| `off()` 返回取消函数           | 调用方可 `const unsub = bus.on('x', fn); later unsub();`   |
| `history` 保留最近 100 条    | 测试时可直接断言 `bus.history`，也可用于事后调试            |
| `eventBus?.emit()` 可选链调用 | handler 没注册时静默跳过，不 crash                          |

---

## At-Source Logging via Callback

### 问题

底层模块发生降级/错误时，返回值中带 `_fallback: true` 标记。上层如果忘记检查这个标记，降级事件就丢失了。日志依赖"调用方记不记得检查"，而不是"事件发生了就应该记录"。

### Callback 方案

底层模块在关键分支点主动调用回调，不依赖上层事后检查返回值。

```javascript
// 底层: chatWithFallback
async chatWithFallback(messages, options = {}, fallbackClient, circuitBreaker) {
  // 降级前调用 callback
  options.onFallback?.({ from: this.model, to: fallbackClient.model, reason: err.message });

  const result = await fallbackClient.chat(messages, options);

  // 降级成功也调用 callback
  options.onFallback?.({ from: this.model, to: fallbackClient.model, reason: 'circuit open' });

  return {
    content: result,
    _fallback: true,   // 返回值标记保留，作为冗余
  };
}

// 上层: 创建时注入 callback
const client = new ModelClient(config);
const result = await client.chatWithFallback(messages, {
  onFallback: (event) => {
    db.logActivity({ action: 'model_fallback', details: event });
    metrics.inc('model_fallback', { from: event.from, to: event.to });
  },
});
```

### 优势

| 对比项           | 返回值标记方案                        | Callback 方案                 |
| ---------------- | ------------------------------------- | ----------------------------- |
| 日志可靠性       | 依赖调用方检查 `_fallback`              | 事件发生即刻记录              |
| 调用方改写量     | 每个调用点加 `if (result._fallback)`    | 构造时一次注入                |
| 多 handler 扩展   | 调用方改代码                          | 注册多个 callback 即可        |
| 不影响返回值结构 | 返回值带 `_fallback` 等非业务字段      | 返回值纯粹，降级信息走回调    |
| 测试             | 调用方需要 mock 并断言 `_fallback`     | 独立测试 callback 即可        |

### 与 EventBus 联动

将 callback 接到 EventBus，实现"底层 → EventBus → 多个 handler"：

```javascript
const eventBus = new EventBus();

// 注册多个 handler
eventBus.on('model_fallback', (d) => db.logActivity({ ... }));
eventBus.on('model_fallback', (d) => metrics.inc('model_fallback'));
eventBus.on('model_fallback', (d) => console.warn('Fallback:', d.reason));

// 底层不需要知道 DB/console/metrics
result = await client.chatWithFallback(messages, {
  onFallback: (d) => eventBus.emit('model_fallback', d),
});
```

---

## 测试策略

```javascript
test("EventBus emit 调用 handler", () => {
  const bus = new EventBus();
  const received = [];
  bus.on("test", (d) => received.push(d));
  bus.emit("test", { msg: "hello" });
  expect(received).toHaveLength(1);
});

test("handler 异常不崩溃", () => {
  const bus = new EventBus();
  bus.on("t", () => { throw new Error("broken"); });
  bus.on("t", () => { /* should still run */ });
  expect(() => bus.emit("t", {})).not.toThrow();
});

test("取消订阅后不再触发", () => {
  const bus = new EventBus();
  let count = 0;
  const unsub = bus.on("t", () => count++);
  bus.emit("t"); expect(count).toBe(1);
  unsub();
  bus.emit("t"); expect(count).toBe(1);
});

test("history 保留最近 N 条", () => {
  const bus = new EventBus();
  for (let i = 0; i < 150; i++) bus.emit("t", { i });
  expect(bus.history.length).toBeLessThanOrEqual(100);
});

test("onFallback 不传时静默跳过", async () => {
  // options 不传 onFallback → ?. 静默跳过, 不 crash
  const result = await client.chatWithFallback(messages, {});
  expect(result._fallback).toBe(false);
});
```

---

## 反模式

| 场景             | 为什么不适合 EventBus                                        |
| ---------------- | ------------------------------------------------------------ |
| 性能敏感内循环   | EventBus 的 Map 查找 + args 构造有开销，不适合 1ms 以下 loop  |
| 需求 A 必须在需求 B 之后 | EventBus 不保证 handler 执行顺序，依赖顺序的场景用显式调用 |
| 回调必须等待返回  | EventBus 是 fire-and-forget，需要 await 的场景用 Promise chain |
| 只有一个 handler   | EventBus 增加了复杂度，直接调用更清晰                        |
| 本地调试日志      | 简单 `console.log` 比 EventBus 更直接，不要过度工程化        |

import { describe, test, expect } from "bun:test";
import { EventBus } from "../server/lib/event-bus.js";

describe("EventBus", () => {
  test("basic emit and on", () => {
    const bus = new EventBus();
    const received = [];
    bus.on("test", (d) => received.push(d));
    bus.emit("test", { msg: "hello" });
    expect(received).toHaveLength(1);
    expect(received[0].msg).toBe("hello");
  });

  test("unsubscribe via returned function", () => {
    const bus = new EventBus();
    let count = 0;
    const unsub = bus.on("t", () => count++);
    bus.emit("t");
    expect(count).toBe(1);
    unsub();
    bus.emit("t");
    expect(count).toBe(1);
  });

  test("handler error does not crash emit", () => {
    const bus = new EventBus();
    let secondRan = false;
    bus.on("t", () => { throw new Error("broken"); });
    bus.on("t", () => { secondRan = true; });
    expect(() => bus.emit("t", {})).not.toThrow();
    expect(secondRan).toBe(true);
  });

  test("emit with no listeners is no-op", () => {
    const bus = new EventBus();
    expect(() => bus.emit("nonexistent", {})).not.toThrow();
  });

  test("history records last 100 events", () => {
    const bus = new EventBus();
    for (let i = 0; i < 150; i++) bus.emit("t", { i });
    expect(bus.history.length).toBeLessThanOrEqual(100);
  });

  test("clearHistory resets history", () => {
    const bus = new EventBus();
    bus.emit("t", {});
    expect(bus.history.length).toBe(1);
    bus.clearHistory();
    expect(bus.history.length).toBe(0);
  });

  test("off removes listener so it no longer fires", () => {
    const bus = new EventBus();
    let count = 0;
    const fn = () => count++;
    bus.on("t", fn);
    bus.emit("t");
    expect(count).toBe(1);
    bus.off("t", fn);
    bus.emit("t");
    expect(count).toBe(1);
  });
});

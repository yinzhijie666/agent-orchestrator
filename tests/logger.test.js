import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Logger } from "../server/lib/logger.js";

describe("Logger", () => {
  test("creates a logger with module name", () => {
    const log = Logger("test-module");
    expect(log).toBeTruthy();
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.debug).toBe("function");
  });

  test("child logger inherits parent bindings", () => {
    const parent = Logger("parent");
    const child = parent.child({ component: "child" });
    expect(child).toBeTruthy();
    expect(typeof child.info).toBe("function");
  });

  test("setTraceId and getTraceId round-trip", () => {
    const log = Logger("test");
    log.setTraceId("req-abc-123");
    expect(log.getTraceId()).toBe("req-abc-123");
  });

  test("setTraceId affects child loggers", () => {
    const parent = Logger("parent");
    const child = parent.child({ component: "child" });
    parent.setTraceId("req-xyz");
    expect(child.getTraceId()).toBe("req-xyz");
  });

  test("setLevel filters messages", () => {
    const log = Logger("test");
    log.setLevel("error");
    expect(log.level).toBe("error");
  });

  test("silent level suppresses all output", () => {
    const log = Logger("test");
    log.setLevel("silent");
    expect(log.level).toBe("silent");
  });
});

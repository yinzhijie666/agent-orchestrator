import { describe, test, expect } from "bun:test";
import { MetricsRegistry } from "../server/lib/metrics.js";

describe("MetricsRegistry", () => {
  test("counter increments and reports value", () => {
    const m = new MetricsRegistry();
    const c = m.counter("test_count", "Test counter");
    expect(c.value()).toBe(0);
    c.inc();
    expect(c.value()).toBe(1);
    c.inc(5);
    expect(c.value()).toBe(6);
  });

  test("gauge can be set, inc'd, and dec'd", () => {
    const m = new MetricsRegistry();
    const g = m.gauge("test_gauge", "Test gauge");
    expect(g.value()).toBe(0);
    g.set(10);
    expect(g.value()).toBe(10);
    g.inc();
    expect(g.value()).toBe(11);
    g.dec(3);
    expect(g.value()).toBe(8);
  });

  test("generates Prometheus text format", () => {
    const m = new MetricsRegistry();
    m.counter("req_total", "Total requests").inc(3);
    m.gauge("conn_active", "Active connections").set(2);
    const output = m.prometheus();

    expect(output).toContain("# HELP req_total Total requests");
    expect(output).toContain("# TYPE req_total counter");
    expect(output).toContain("req_total 3");
    expect(output).toContain("# HELP conn_active Active connections");
    expect(output).toContain("# TYPE conn_active gauge");
    expect(output).toContain("conn_active 2");
  });

  test("counter with labels", () => {
    const m = new MetricsRegistry();
    const c = m.counter("http_requests", "HTTP requests", ["method", "path"]);
    c.labels({ method: "GET", path: "/api/status" }).inc();
    c.labels({ method: "GET", path: "/api/status" }).inc();
    c.labels({ method: "POST", path: "/api/plans" }).inc();
    const output = m.prometheus();
    expect(output).toContain('http_requests{method="GET",path="/api/status"} 2');
    expect(output).toContain('http_requests{method="POST",path="/api/plans"} 1');
  });

  test("multiple counter instances are independent", () => {
    const m = new MetricsRegistry();
    const a = m.counter("a", "counter a");
    const b = m.counter("b", "counter b");
    a.inc();
    b.inc(2);
    const output = m.prometheus();
    expect(output).toContain("a 1");
    expect(output).toContain("b 2");
  });
});

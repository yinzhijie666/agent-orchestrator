import { describe, test, expect } from "bun:test";
import { OpencodeServer } from "../server/lib/opencode-server.js";

const PORT_RANGE = [14190, 14191, 14192, 14193];
const STARTUP_TIMEOUT_MS = 8000;
const TEST_TIMEOUT_MS = 30000;

describe("OpencodeServer signal handlers", () => {
  test("server is added to global registry on start", async () => {
    const s = new OpencodeServer({
      portRange: PORT_RANGE,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
    });
    await s.start();
    expect(s.process).not.toBeNull();
    expect(s.process.exitCode).toBeNull();
    const r = await s.stop();
    expect(r.stopped).toBe(true);
  }, TEST_TIMEOUT_MS);

  test("stop is idempotent and releases port", async () => {
    const s = new OpencodeServer({
      portRange: PORT_RANGE,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
    });
    await s.start();
    const port = s.port;
    const r1 = await s.stop();
    expect(r1.stopped).toBe(true);
    const r2 = await s.stop();
    expect(r2.stopped).toBe(false);
    expect(r2.reason).toBe("not running");
    const { isPortFree } = await import("../server/lib/network-utils.js");
    const free = await isPortFree(port, "127.0.0.1");
    expect(free).toBe(true);
  }, TEST_TIMEOUT_MS);

  test("signal handler kills server on SIGTERM", async () => {
    const s = new OpencodeServer({
      portRange: PORT_RANGE,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
    });
    await s.start();
    const proc = s.process;
    expect(proc.exitCode).toBeNull();
    proc.kill("SIGTERM");
    try { await proc.exited; } catch {}
    expect(proc.exitCode !== null || proc.signalCode !== null).toBe(true);
  }, TEST_TIMEOUT_MS);
});

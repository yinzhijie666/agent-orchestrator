import { describe, test, expect } from "bun:test";
import { generateRequestId, extractRequestId, REQUEST_ID_HEADER } from "../server/lib/request-id.js";

describe("generateRequestId", () => {
  test("returns a non-empty string", () => {
    const id = generateRequestId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  test("returns unique IDs on successive calls", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });

  test("UUID format: 8-4-4-4-12 hex pattern", () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe("extractRequestId", () => {
  test("returns existing request-id from headers", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: "abc-123" });
    expect(extractRequestId(headers)).toBe("abc-123");
  });

  test("returns null when header is missing", () => {
    const headers = new Headers();
    expect(extractRequestId(headers)).toBeNull();
  });

  test("generates new id when generateIfMissing=true", () => {
    const headers = new Headers();
    const id = extractRequestId(headers, { generateIfMissing: true });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(headers.get(REQUEST_ID_HEADER)).toBe(id);
  });

  test("case-insensitive header matching", () => {
    const headers = new Headers({ "X-Request-Id": "abc-123" });
    expect(extractRequestId(headers)).toBe("abc-123");
  });

  test("case-insensitive: finds X-Request-Id when x-request-id not set", () => {
    const headers = new Headers({ "X-Request-Id": "found" });
    expect(extractRequestId(headers)).toBe("found");
  });
});

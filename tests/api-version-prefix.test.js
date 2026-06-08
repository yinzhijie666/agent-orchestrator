import { describe, test, expect } from "bun:test";
import { versionPrefix } from "../server/lib/version-prefix.js";

describe("API version prefix", () => {
  test("strips v1 prefix from /api/v1/plans", () => {
    expect(versionPrefix("/api/v1/plans")).toBe("/api/plans");
  });

  test("strips v1 prefix from /api/v1/checkpoints", () => {
    expect(versionPrefix("/api/v1/checkpoints")).toBe("/api/checkpoints");
  });

  test("leaves /api/plans unchanged", () => {
    expect(versionPrefix("/api/plans")).toBe("/api/plans");
  });

  test("leaves /health unchanged", () => {
    expect(versionPrefix("/health")).toBe("/health");
  });

  test("strips v1 prefix from /api/v1/status", () => {
    expect(versionPrefix("/api/v1/status")).toBe("/api/status");
  });

  test("strips v1 prefix from /api/v1/threads/abc/messages", () => {
    expect(versionPrefix("/api/v1/threads/abc/messages")).toBe("/api/threads/abc/messages");
  });
});

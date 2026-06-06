import { describe, test, expect } from "bun:test";
import MiniMaxClient from "../server/lib/model-clients/minimax-client.js";

describe("MiniMax writeForbidden enforcement", () => {
  test("isReadOnly returns true", () => {
    expect(MiniMaxClient.isReadOnly()).toBe(true);
  });

  test("writeForbidden throws read-only error", () => {
    const client = new MiniMaxClient({
      api_key_env: "OPENCODE_API_KEY",
      base_url: "http://x",
      model: "m",
      max_tokens: 100,
      provider: "opencode-zen",
    });
    expect(() => client.writeForbidden()).toThrow("MiniMax agent is read-only");
  });

  test("MiniMax client has no write methods (only read operations)", () => {
    const proto = MiniMaxClient.prototype;
    const writeMethods = ["writeFile", "saveFile", "createFile", "updateFile", "deleteFile"];
    for (const m of writeMethods) {
      expect(proto[m]).toBeUndefined();
    }
    expect(typeof proto.searchCode).toBe("function");
    expect(typeof proto.readFileSummary).toBe("function");
    expect(typeof proto.batchQuery).toBe("function");
  });
});

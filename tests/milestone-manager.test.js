import { describe, test, expect } from "bun:test";
import { MilestoneManager } from "../server/lib/milestone-manager.js";

describe("MilestoneManager extracted module", () => {
  test("imports from milestone-manager.js succeed", () => {
    expect(MilestoneManager).toBeDefined();
  });

  test("AgentRouter is no longer defined in agent-router.js", async () => {
    const mod = await import("../server/lib/agent-router.js");
    expect(mod.AgentRouter).toBeUndefined();
  });
});

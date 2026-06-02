import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import broadcaster from "../server/websocket/broadcaster.js";
import { markAsServerProcess, emitPlanCreated } from "../server/lib/events.js";

describe("PR7: events.js mode switching", () => {
  test("markAsServerProcess makes emit use local broadcaster", () => {
    markAsServerProcess();
    const received = [];
    const originalBroadcast = broadcaster.broadcast.bind(broadcaster);
    broadcaster.broadcast = (type, payload) => {
      received.push({ type, payload });
    };

    emitPlanCreated("p1", { title: "T", items: [1, 2] });

    expect(received.length).toBe(1);
    expect(received[0].type).toBe("plan.created");
    expect(received[0].payload.items).toBe(2);

    broadcaster.broadcast = originalBroadcast;
  });

  test("emit functions produce correct event shapes", () => {
    markAsServerProcess();
    const received = [];
    const originalBroadcast = broadcaster.broadcast.bind(broadcaster);
    broadcaster.broadcast = (type, payload) => {
      received.push({ type, payload });
    };

    const { emitItemCompleted, emitCheckpointVerified, emitModelFallback } = require("../server/lib/events.js");

    emitItemCompleted("p1", { executor: "deepseek", title: "Task", idx: 0 }, "completed");
    expect(received[received.length - 1].type).toBe("item.completed");
    expect(received[received.length - 1].payload.status).toBe("completed");

    emitCheckpointVerified("cp1", "passed");
    expect(received[received.length - 1].type).toBe("checkpoint.verified");

    emitModelFallback("kimi", "deepseek", "timeout");
    expect(received[received.length - 1].type).toBe("model.fallback");

    broadcaster.broadcast = originalBroadcast;
  });
});

describe("PR7: HTTP bridge — internal event endpoint", () => {
  test("internal-event router accepts valid payload", async () => {
    const internalEventRouter = (await import("../server/api/internal-event.js")).default;
    const received = [];
    const originalBroadcast = broadcaster.broadcast.bind(broadcaster);
    broadcaster.broadcast = (type, payload) => {
      received.push({ type, payload });
    };

    const mockReq = {
      json: async () => ({ type: "plan.created", payload: { plan_id: "p1" } }),
    };

    const res = await internalEventRouter.handleEvent(mockReq);
    expect(res.status).toBe(200);
    expect(received.length).toBe(1);
    expect(received[0].type).toBe("plan.created");

    broadcaster.broadcast = originalBroadcast;
  });

  test("internal-event router rejects missing type", async () => {
    const internalEventRouter = (await import("../server/api/internal-event.js")).default;
    const mockReq = {
      json: async () => ({ payload: {} }),
    };

    const res = await internalEventRouter.handleEvent(mockReq);
    expect(res.status).toBe(400);
  });
});

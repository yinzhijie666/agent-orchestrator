import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import broadcaster from "../server/websocket/broadcaster.js";
import {
  emitCheckpointCreated,
  emitCheckpointVerified,
  emitItemCompleted,
  emitItemStarted,
  emitModelFallback,
  emitPlanActivated,
  emitPlanCompleted,
  emitPlanCreated,
} from "../server/lib/events.js";

describe("events module (PR3: Stage 6.1)", () => {
  let received;
  let originalBroadcast;

  beforeAll(() => {
    originalBroadcast = broadcaster.broadcast.bind(broadcaster);
    received = [];
    broadcaster.broadcast = (type, payload) => {
      received.push({ type, payload, timestamp: new Date().toISOString() });
    };
  });

  afterAll(() => {
    broadcaster.broadcast = originalBroadcast;
  });

  test("emitPlanCreated broadcasts plan.created", () => {
    emitPlanCreated("p1", { title: "T1", items: [{}, {}] });
    const last = received[received.length - 1];
    expect(last.type).toBe("plan.created");
    expect(last.payload.plan_id).toBe("p1");
    expect(last.payload.title).toBe("T1");
    expect(last.payload.items).toBe(2);
  });

  test("emitPlanActivated broadcasts plan.activated", () => {
    emitPlanActivated("p1");
    const last = received[received.length - 1];
    expect(last.type).toBe("plan.activated");
    expect(last.payload.plan_id).toBe("p1");
  });

  test("emitPlanCompleted broadcasts plan.completed with status", () => {
    emitPlanCompleted("p1", "completed_with_errors");
    const last = received[received.length - 1];
    expect(last.type).toBe("plan.completed");
    expect(last.payload.status).toBe("completed_with_errors");
  });

  test("emitItemStarted broadcasts item.started with full payload", () => {
    emitItemStarted("p1", { idx: 2, title: "Task 3", executor: "deepseek" });
    const last = received[received.length - 1];
    expect(last.type).toBe("item.started");
    expect(last.payload.idx).toBe(2);
    expect(last.payload.title).toBe("Task 3");
    expect(last.payload.agent).toBe("deepseek");
  });

  test("emitItemCompleted broadcasts item.completed with status (success/failed)", () => {
    emitItemCompleted("p1", { idx: 0, title: "T", executor: "minimax" }, "failed");
    const last = received[received.length - 1];
    expect(last.type).toBe("item.completed");
    expect(last.payload.status).toBe("failed");
  });

  test("emitCheckpointCreated broadcasts checkpoint.created", () => {
    emitCheckpointCreated("p1", "cp-1", 4);
    const last = received[received.length - 1];
    expect(last.type).toBe("checkpoint.created");
    expect(last.payload.checkpoint_id).toBe("cp-1");
    expect(last.payload.milestone_idx).toBe(4);
  });

  test("emitCheckpointVerified broadcasts checkpoint.verified", () => {
    emitCheckpointVerified("cp-1", "passed");
    const last = received[received.length - 1];
    expect(last.type).toBe("checkpoint.verified");
    expect(last.payload.result).toBe("passed");
  });

  test("emitModelFallback broadcasts model.fallback", () => {
    emitModelFallback("kimi", "deepseek", "rate_limit");
    const last = received[received.length - 1];
    expect(last.type).toBe("model.fallback");
    expect(last.payload.from).toBe("kimi");
    expect(last.payload.to).toBe("deepseek");
    expect(last.payload.reason).toBe("rate_limit");
  });

  test("broadcaster.broadcast can be replaced without affecting other code", () => {
    expect(typeof broadcaster.broadcast).toBe("function");
    expect(received.length).toBeGreaterThan(0);
  });
});

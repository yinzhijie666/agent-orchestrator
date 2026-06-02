import broadcaster from "../websocket/broadcaster.js";

const PLUGIN_EMIT_URL = process.env.AGENT_ORCHESTRATOR_INTERNAL_URL || "http://127.0.0.1:8765/api/internal/event";
let isServerProcess = false;

export function markAsServerProcess() {
  isServerProcess = true;
}

function emit(type, payload) {
  if (isServerProcess) {
    try { broadcaster.broadcast(type, payload); } catch {}
  } else {
    fetch(PLUGIN_EMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    }).catch(() => {});
  }
}

export function emitPlanCreated(planId, plan) {
  emit("plan.created", {
    plan_id: planId,
    title: plan.title,
    items: plan.items.length,
  });
}

export function emitPlanActivated(planId) {
  emit("plan.activated", { plan_id: planId });
}

export function emitPlanCompleted(planId, status) {
  emit("plan.completed", { plan_id: planId, status });
}

export function emitItemStarted(planId, item) {
  emit("item.started", {
    plan_id: planId,
    agent: item.executor,
    title: item.title,
    idx: item.idx,
  });
}

export function emitItemCompleted(planId, item, status) {
  emit("item.completed", {
    plan_id: planId,
    agent: item.executor,
    title: item.title,
    idx: item.idx,
    status,
  });
}

export function emitCheckpointCreated(planId, checkpointId, milestoneIdx) {
  emit("checkpoint.created", {
    plan_id: planId,
    checkpoint_id: checkpointId,
    milestone_idx: milestoneIdx,
  });
}

export function emitCheckpointVerified(checkpointId, result) {
  emit("checkpoint.verified", {
    checkpoint_id: checkpointId,
    result,
  });
}

export function emitModelFallback(from, to, reason) {
  emit("model.fallback", { from, to, reason });
}

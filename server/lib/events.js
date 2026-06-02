import broadcaster from "../websocket/broadcaster.js";

export function emitPlanCreated(planId, plan) {
  broadcaster.broadcast("plan.created", {
    plan_id: planId,
    title: plan.title,
    items: plan.items.length,
  });
}

export function emitPlanActivated(planId) {
  broadcaster.broadcast("plan.activated", { plan_id: planId });
}

export function emitPlanCompleted(planId, status) {
  broadcaster.broadcast("plan.completed", { plan_id: planId, status });
}

export function emitItemStarted(planId, item) {
  broadcaster.broadcast("item.started", {
    plan_id: planId,
    agent: item.executor,
    title: item.title,
    idx: item.idx,
  });
}

export function emitItemCompleted(planId, item, status) {
  broadcaster.broadcast("item.completed", {
    plan_id: planId,
    agent: item.executor,
    title: item.title,
    idx: item.idx,
    status,
  });
}

export function emitCheckpointCreated(planId, checkpointId, milestoneIdx) {
  broadcaster.broadcast("checkpoint.created", {
    plan_id: planId,
    checkpoint_id: checkpointId,
    milestone_idx: milestoneIdx,
  });
}

export function emitCheckpointVerified(checkpointId, result) {
  broadcaster.broadcast("checkpoint.verified", {
    checkpoint_id: checkpointId,
    result,
  });
}

export function emitModelFallback(from, to, reason) {
  broadcaster.broadcast("model.fallback", { from, to, reason });
}

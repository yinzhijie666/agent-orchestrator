import broadcaster from "../websocket/broadcaster.js";

const PLUGIN_EMIT_URL = process.env.AGENT_ORCHESTRATOR_INTERNAL_URL || "http://127.0.0.1:8765/api/internal/event";
let isServerProcess = false;

export function markAsServerProcess() {
  isServerProcess = true;
}

async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if ((res.status === 429 || res.status >= 500) && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        continue;
      }
      return res;
    } catch (err) {
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        continue;
      }
      throw err;
    }
  }
}

function emit(type, payload, planId = null) {
  if (isServerProcess) {
    try { broadcaster.broadcast(type, payload, planId); } catch {}
  } else {
    fetchWithRetry(PLUGIN_EMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, planId }),
    }).catch((err) => {
      console.warn(`[events] emit ${type} failed after retries: ${err.message}`);
    });
  }
}

export function emitPlanCreated(planId, plan) {
  emit("plan.created", {
    plan_id: planId,
    title: plan.title,
    items: plan.items.length,
  }, planId);
}

export function emitPlanActivated(planId) {
  emit("plan.activated", { plan_id: planId }, planId);
}

export function emitPlanCompleted(planId, status) {
  emit("plan.completed", { plan_id: planId, status }, planId);
}

export function emitItemStarted(planId, item) {
  emit("item.started", {
    plan_id: planId,
    agent: item.executor,
    title: item.title,
    idx: item.idx,
  }, planId);
}

export function emitItemCompleted(planId, item, status) {
  emit("item.completed", {
    plan_id: planId,
    agent: item.executor,
    title: item.title,
    idx: item.idx,
    status,
  }, planId);
}

export function emitCheckpointCreated(planId, checkpointId, milestoneIdx) {
  emit("checkpoint.created", {
    plan_id: planId,
    checkpoint_id: checkpointId,
    milestone_idx: milestoneIdx,
  }, planId);
}

export function emitCheckpointVerified(checkpointId, result, planId) {
  emit("checkpoint.verified", {
    checkpoint_id: checkpointId,
    result,
  }, planId);
}

export function emitModelFallback(from, to, reason, planId = null) {
  emit("model.fallback", { from, to, reason }, planId);
}

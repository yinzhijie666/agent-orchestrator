import { randomUUID } from "node:crypto";
import db from "./db.js";
import { config } from "./config.js";

class MilestoneManager {
  constructor(interval) {
    this.interval = interval || config.milestone?.interval || 4;
  }

  shouldCheckpoint(planId) {
    const plan = db.getPlan(planId);
    if (!plan) return false;

    const items = db.getPlanItems(planId);
    const completed = items.filter(i => i.status === 'completed').length;
    const total = items.length;

    return completed > 0 && completed % this.interval === 0 && completed < total;
  }

  getNextCheckpointIndex(planId) {
    const items = db.getPlanItems(planId);
    const completed = items.filter(i => i.status === 'completed').length;
    return Math.ceil(completed / this.interval) * this.interval;
  }

  createCheckpoint(planId, milestoneIdx) {
    const items = db.getPlanItems(planId);
    const completedItems = items.filter(i => i.idx < milestoneIdx);

    const agentOutputs = {
      kimi: this._collectAgentOutput(items, 'kimi', milestoneIdx),
      deepseek: this._collectAgentOutput(items, 'deepseek', milestoneIdx),
      zen: this._collectAgentOutput(items, 'zen', milestoneIdx),
    };

    const checkpoint = {
      id: randomUUID(),
      plan_id: planId,
      milestone_idx: milestoneIdx,
      agent_outputs: agentOutputs,
      verification_status: 'pending',
    };

    db.createCheckpoint(checkpoint);

    db.logActivity({
      plan_id: planId,
      agent: 'system',
      action: 'checkpoint_created',
      details: { checkpoint_id: checkpoint.id, milestone_idx: milestoneIdx }
    });

    return checkpoint;
  }

  _collectAgentOutput(items, agent, milestoneIdx) {
    const agentItems = items
      .filter(i => i.executor === agent && i.idx < milestoneIdx)
      .map(i => ({
        idx: i.idx,
        title: i.title,
        status: i.status,
        result: i.result,
      }));
    return agentItems;
  }

  async verifyCheckpoint(checkpointId, result) {
    const cp = db.verifyCheckpoint(checkpointId, result.status, result.feedback);

    db.logActivity({
      plan_id: cp.plan_id,
      agent: 'kimi',
      action: 'checkpoint_verified',
      details: { checkpoint_id: checkpointId, result: result.status }
    });

    return cp;
  }

  getPendingCheckpoints(planId) {
    return db.db.prepare(
      "SELECT * FROM checkpoints WHERE plan_id = ? AND verification_status = 'pending' ORDER BY created_at DESC"
    ).all(planId);
  }
}

export { MilestoneManager };
export default MilestoneManager;

import { randomUUID } from "node:crypto";
import db from "./db.js";
import config from "../config/default.json" with { type: "json" };

class AgentRouter {
  constructor() {
    this.config = config.models;
    this.routingTable = {
      // Planning & architecture
      planning: "kimi",
      architecture: "kimi",
      review: "kimi",
      debug: "kimi",
      
      // Implementation
      coding: "deepseek",
      testing: "deepseek",
      implementation: "deepseek",
      refactoring: "deepseek",
      
      // Information retrieval
      search: "minimax",
      grep: "minimax",
      read_file: "minimax",
      status_check: "minimax",
      batch_query: "minimax",
    };
    
    // Fallback chain: primary model → fallback models
    this.fallbackChain = {
      kimi: ["deepseek"],      // Kimi fails → try DeepSeek
      deepseek: [],            // DeepSeek has no fallback
      minimax: []              // MiniMax has no fallback
    };
  }

  getFallbackModel(primary) {
    return this.fallbackChain[primary]?.[0] || null;
  }

  hasFallback(primary) {
    return !!this.fallbackChain[primary]?.length;
  }

  route(taskType) {
    const executor = this.routingTable[taskType.toLowerCase()];
    if (executor) return executor;
    
    // Default: complex tasks go to Kimi for decomposition
    return "kimi";
  }

  canDelegate(parentLayer, subtaskType) {
    const subExecutor = this.route(subtaskType);
    
    // Kimi can delegate coding and search tasks
    if (parentLayer === "kimi" && ["deepseek", "minimax"].includes(subExecutor)) {
      return true;
    }
    
    // DeepSeek can delegate search tasks
    if (parentLayer === "deepseek" && subExecutor === "minimax") {
      return true;
    }
    
    return false;
  }

  getModelConfig(layer) {
    return this.config[layer];
  }

  getAllConfigs() {
    return this.config;
  }
}

class MilestoneManager {
  constructor(interval = config.milestone.interval) {
    this.interval = interval;
  }

  shouldCheckpoint(planId) {
    const plan = db.getPlan(planId);
    if (!plan) return false;
    
    const items = db.getPlanItems(planId);
    const completed = items.filter(i => i.status === 'completed').length;
    const total = items.length;
    
    // Check at interval boundaries, but not at the very end
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
      minimax: this._collectAgentOutput(items, 'minimax', milestoneIdx),
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

export { AgentRouter, MilestoneManager };
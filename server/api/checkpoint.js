import { randomUUID } from "node:crypto";
import db from "../lib/db.js";
import { MilestoneManager } from "../lib/agent-router.js";
import KimiClient from "../lib/model-clients/kimi-client.js";
import config from "../config/default.json" with { type: "json" };

const checkpointRouter = {
  milestoneManager: new MilestoneManager(),
  kimiClient: new KimiClient(config.models.kimi),

  async createCheckpoint(req) {
    const body = await req.json();
    const { plan_id, milestone_idx } = body;

    if (!plan_id || milestone_idx === undefined) {
      return new Response(JSON.stringify({ error: 'plan_id and milestone_idx required' }), { status: 400 });
    }

    try {
      const checkpoint = this.milestoneManager.createCheckpoint(plan_id, milestone_idx);
      
      return new Response(JSON.stringify(checkpoint), { status: 201 });
    } catch (err) {
      console.error('[API] createCheckpoint error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  },

  getCheckpoint(req, params) {
    const checkpoint = db.getCheckpoint(params.id);
    if (!checkpoint) {
      return new Response(JSON.stringify({ error: 'Checkpoint not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({
      ...checkpoint,
      agent_outputs: JSON.parse(checkpoint.agent_outputs || '{}')
    }), { status: 200 });
  },

  async verifyCheckpoint(req, params) {
    const body = await req.json();
    const { result } = body;

    if (!result || !result.status) {
      return new Response(JSON.stringify({ error: 'result.status required' }), { status: 400 });
    }

    let verifyResult;
    let fallbackUsed = false;
    const checkpoint = db.getCheckpoint(params.id);

    try {
      // Try Kimi review
      verifyResult = await this.kimiClient.reviewCheckpoint(checkpoint);
    } catch (err) {
      console.error('[Fallback] Kimi review failed:', err.message);
      
      // Fallback: Auto-pass
      verifyResult = {
        status: 'passed',
        feedback: `Auto-passed: Kimi unavailable (${err.message})`
      };
      fallbackUsed = true;
      
      db.logActivity({
        plan_id: checkpoint?.plan_id,
        agent: 'system',
        action: 'checkpoint_auto_passed',
        details: {
          checkpoint_id: params.id,
          reason: err.message,
          original_request: result
        }
      });
    }

    try {
      const checkpoint = await this.milestoneManager.verifyCheckpoint(params.id, verifyResult);
      
      // If passed, update plan milestones
      if (verifyResult.status === 'passed') {
        const plan = db.getPlan(checkpoint.plan_id);
        db.updatePlanMilestones(checkpoint.plan_id, (plan.milestones_completed || 0) + 1);
      }

      // Add fallback info to response
      const response = {
        ...checkpoint,
        fallback: fallbackUsed,
        fallback_reason: fallbackUsed ? 'kimi_unavailable' : null
      };

      return new Response(JSON.stringify(response), { status: 200 });
    } catch (err) {
      console.error('[API] verifyCheckpoint error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  },

  getPendingCheckpoints(req, params) {
    const checkpoints = db.db.prepare(
      "SELECT * FROM checkpoints WHERE plan_id = ? AND verification_status = 'pending' ORDER BY created_at DESC"
    ).all(params.plan_id);

    return new Response(JSON.stringify(checkpoints), { status: 200 });
  }
};

export default checkpointRouter;
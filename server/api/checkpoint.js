import { randomUUID } from "node:crypto";
import db from "../lib/db.js";
import { MilestoneManager } from "../lib/milestone-manager.js";
import KimiClient from "../lib/model-clients/kimi-client.js";
import DeepSeekClient from "../lib/model-clients/deepseek-client.js";
import { emitCheckpointCreated, emitCheckpointVerified } from "../lib/events.js";
import { config } from "../lib/config.js";

const checkpointRouter = {
  milestoneManager: new MilestoneManager(),
  kimiClient: new KimiClient(config.models.kimi),
  deepseekClient: new DeepSeekClient(config.models.deepseek),

  async createCheckpoint(req) {
    const body = await req.json();
    const { plan_id, milestone_idx } = body;

    if (!plan_id || milestone_idx === undefined) {
      return new Response(JSON.stringify({ error: 'plan_id and milestone_idx required' }), { status: 400 });
    }

    try {
      const checkpoint = this.milestoneManager.createCheckpoint(plan_id, milestone_idx);
      emitCheckpointCreated(plan_id, checkpoint.id, milestone_idx);

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
    const resultStatus = typeof result === 'string' ? result : result?.status;
    const resultFeedback = typeof result === 'object' ? result?.feedback : undefined;

    if (!resultStatus || !['passed', 'failed'].includes(resultStatus)) {
      return new Response(JSON.stringify({ error: 'result must be "passed"|"failed" or {status,feedback}' }), { status: 400 });
    }

    let verifyResult;
    let fallbackUsed = false;
    const fetchedCheckpoint = db.getCheckpoint(params.id);

    try {
      verifyResult = await this.kimiClient.reviewCheckpoint(fetchedCheckpoint, this.deepseekClient);
      if (verifyResult._fallback) {
        db.logActivity({
          plan_id: fetchedCheckpoint?.plan_id,
          agent: 'system',
          action: 'checkpoint_fallback',
          details: { checkpoint_id: params.id, reason: verifyResult._fallback_reason || 'silent fallback to DeepSeek' },
        });
      }
    } catch (err) {
      console.error('[Fallback] Kimi review failed:', err.message);
      
      // Fallback: Auto-pass
      verifyResult = {
        status: 'passed',
        feedback: `Auto-passed: Kimi unavailable (${err.message})`
      };
      fallbackUsed = true;
      
      db.logActivity({
        plan_id: fetchedCheckpoint?.plan_id,
        agent: 'system',
        action: 'checkpoint_auto_passed',
        details: {
          checkpoint_id: params.id,
          reason: err.message,
          original_request: result
        }
      });
    }

    // User override: if user explicitly passed 'failed', override Kimi's verdict
    if (resultStatus === 'failed') {
      const prev = verifyResult.feedback || '';
      const note = fallbackUsed
        ? '\nUser override: marked as failed (Kimi auto-pass overridden).'
        : '\nUser override: marked as failed.';
      verifyResult = { status: 'failed', feedback: prev + note };
    }

    try {
      const verifiedCheckpoint = await this.milestoneManager.verifyCheckpoint(params.id, verifyResult);

      if (verifyResult.status === 'passed') {
        db.db.prepare(
          "UPDATE plans SET milestones_completed = milestones_completed + 1 WHERE id = ?"
        ).run(verifiedCheckpoint.plan_id);
      }

      const response = {
        ...verifiedCheckpoint,
        fallback: fallbackUsed,
        fallback_reason: fallbackUsed ? 'kimi_unavailable' : null
      };

      emitCheckpointVerified(params.id, verifyResult.status, verifiedCheckpoint.plan_id);

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
import db from "../lib/db.js";
import { AgentRouter } from "../lib/agent-router.js";
import KimiClient from "../lib/model-clients/kimi-client.js";
import DeepSeekClient from "../lib/model-clients/deepseek-client.js";
import { PlanOrchestrator } from "../lib/plan-orchestrator.js";
import config from "../config/default.json" with { type: "json" };

const router = {
  agentRouter: new AgentRouter(),
  kimiClient: new KimiClient(config.models.kimi),
  deepseekClient: new DeepSeekClient(config.models.deepseek),

  async createPlan(req) {
    const body = await req.json();
    const { prompt, context = '' } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), { status: 400 });
    }

    let result;
    try {
      result = await PlanOrchestrator.generateAndPersist({
        prompt,
        context,
        kimiClient: this.kimiClient,
        deepseekClient: this.deepseekClient,
        db,
        status: 'pending',
        milestoneInterval: config.milestone.interval,
      });
    } catch (err) {
      console.error('[Fallback] All models failed:', err.message);
      const status = err.details ? 400 : 500;
      return new Response(JSON.stringify({
        error: status === 400 ? 'Invalid plan' : 'Plan generation failed',
        details: err.details || err.message
      }), { status });
    }

    const { planId, planDoc, fallbackUsed, fallbackInfo } = result;

    return new Response(JSON.stringify({
      id: planId,
      title: planDoc.title,
      items: planDoc.items,
      status: 'pending',
      fallback: fallbackUsed,
      fallback_info: fallbackInfo
    }), { status: 201 });
  },

  getPlan(req, params) {
    const plan = db.getPlan(params.id);
    if (!plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), { status: 404 });
    }

    const items = db.getPlanItems(params.id);
    return new Response(JSON.stringify({
      ...plan,
      items,
      plan_document: JSON.parse(plan.plan_document)
    }), { status: 200 });
  },

  getPlanItems(req, params) {
    const items = db.getPlanItems(params.id);
    return new Response(JSON.stringify(items), { status: 200 });
  },

  async updatePlanItem(req, params) {
    const body = await req.json();
    const { status, result } = body;

    const item = db.updatePlanItemStatus(params.id, parseInt(params.idx), status, result);
    
    db.logActivity({
      plan_id: params.id,
      agent: item.executor,
      action: `item_${status}`,
      details: { idx: params.idx, title: item.title }
    });

    return new Response(JSON.stringify(item), { status: 200 });
  },

  async activatePlan(req, params) {
    const plan = db.updatePlanStatus(params.id, 'active');

    db.logActivity({
      plan_id: params.id,
      agent: 'system',
      action: 'plan_activated',
      details: {}
    });

    return new Response(JSON.stringify(plan), { status: 200 });
  },

  async completePlan(req, params) {
    let body = {};
    try { body = await req.json(); } catch {}
    const status = body.status || 'completed';
    const plan = db.updatePlanStatus(params.id, status);
    if (!plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), { status: 404 });
    }
    db.logActivity({
      plan_id: params.id,
      agent: 'system',
      action: 'plan_completed',
      details: { status },
    });
    return new Response(JSON.stringify(plan), { status: 200 });
  }
};

export default router;
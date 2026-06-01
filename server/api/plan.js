import { randomUUID } from "node:crypto";
import db from "../lib/db.js";
import PlanParser from "../lib/plan-parser.js";
import { AgentRouter } from "../lib/agent-router.js";
import KimiClient from "../lib/model-clients/kimi-client.js";
import DeepSeekClient from "../lib/model-clients/deepseek-client.js";
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

    let planDoc;
    let fallbackUsed = false;
    let fallbackInfo = null;

    try {
      // Generate plan using Kimi
      planDoc = await this.kimiClient.generatePlan(prompt, context);
    } catch (err) {
      console.error('[Fallback] Kimi failed:', err.message);
      
      // Fallback to DeepSeek
      try {
        console.log('[Fallback] Trying DeepSeek...');
        planDoc = await this.deepseekClient.generatePlan(prompt, context);
        fallbackUsed = true;
        fallbackInfo = {
          from: 'kimi',
          to: 'deepseek',
          reason: err.message,
          timestamp: new Date().toISOString()
        };
      } catch (fallbackErr) {
        console.error('[Fallback] DeepSeek also failed:', fallbackErr.message);
        return new Response(JSON.stringify({
          error: 'Both Kimi and DeepSeek failed',
          kimi_error: err.message,
          deepseek_error: fallbackErr.message
        }), { status: 500 });
      }
    }

    const validation = PlanParser.validate(planDoc);

    if (!validation.valid) {
      return new Response(JSON.stringify({ error: 'Invalid plan', details: validation.errors }), { status: 400 });
    }

    const planId = randomUUID();
    
    // Save to database
    db.createPlan({
      id: planId,
      title: planDoc.title,
      plan_document: JSON.stringify(planDoc),
      status: 'pending',
      milestones_total: Math.ceil(planDoc.items.length / config.milestone.interval),
      fallback_used: fallbackUsed
    });

    // Create plan items
    planDoc.items.forEach(item => {
      db.createPlanItem({
        plan_id: planId,
        idx: item.idx,
        title: item.title,
        description: item.description,
        executor: item.executor,
        status: 'pending'
      });
    });

    // Create agent thread
    db.createThread({
      id: randomUUID(),
      plan_id: planId,
      context_window: {},
      layer_states: { kimi: {}, deepseek: {}, minimax: {} }
    });

    // Log fallback if used
    if (fallbackUsed) {
      db.logActivity({
        plan_id: planId,
        agent: 'system',
        action: 'model_fallback',
        details: fallbackInfo
      });
    }

    db.logActivity({
      plan_id: planId,
      agent: fallbackUsed ? 'deepseek' : 'kimi',
      action: 'plan_created',
      details: { 
        title: planDoc.title, 
        items_count: planDoc.items.length,
        fallback: fallbackUsed 
      }
    });

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
  }
};

export default router;
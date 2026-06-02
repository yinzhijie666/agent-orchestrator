import { randomUUID } from "node:crypto";
import PlanParser from "./plan-parser.js";

export class PlanOrchestrator {
  static async generateAndPersist({ prompt, context, kimiClient, deepseekClient, db, status = "active", milestoneInterval = 4 }) {
    let planDoc;
    let fallbackUsed = false;
    let fallbackInfo = null;

    try {
      planDoc = await kimiClient.generatePlan(prompt, context, deepseekClient);
      if (planDoc._fallback) {
        fallbackUsed = true;
        fallbackInfo = {
          from: "kimi",
          to: "deepseek",
          reason: planDoc._fallback_reason || "Kimi unavailable",
          timestamp: new Date().toISOString(),
        };
      }
    } catch (err) {
      const wrapped = new Error(`Plan generation failed: ${err.message}`);
      wrapped.cause = err;
      throw wrapped;
    }

    const validation = PlanParser.validate(planDoc);
    if (!validation.valid) {
      const err = new Error(`Invalid plan: ${validation.errors.join(", ")}`);
      err.details = validation.errors;
      throw err;
    }

    const planId = randomUUID();
    db.createPlan({
      id: planId,
      title: planDoc.title,
      plan_document: JSON.stringify(planDoc),
      status,
      milestones_total: Math.ceil(planDoc.items.length / milestoneInterval),
      fallback_used: fallbackUsed,
    });

    planDoc.items.forEach((item) => {
      db.createPlanItem({
        plan_id: planId,
        idx: item.idx,
        title: item.title,
        description: item.description,
        executor: item.executor,
        status: "pending",
      });
    });

    if (fallbackUsed) {
      db.logActivity({
        plan_id: planId,
        agent: "system",
        action: "model_fallback",
        details: fallbackInfo,
      });
    }

    db.logActivity({
      plan_id: planId,
      agent: fallbackUsed ? "deepseek" : "kimi",
      action: "plan_created",
      details: {
        title: planDoc.title,
        items_count: planDoc.items.length,
        fallback: fallbackUsed,
      },
    });

    return { planId, planDoc, fallbackUsed, fallbackInfo };
  }
}

export default PlanOrchestrator;

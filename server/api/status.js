import db from "../lib/db.js";

const statusRouter = {
  getStatus() {
    const plans = db.db.prepare("SELECT status, COUNT(*) as count FROM plans GROUP BY status").all();
    const totalItems = db.db.prepare("SELECT COUNT(*) as count FROM plan_items").get();
    const completedItems = db.db.prepare("SELECT COUNT(*) as count FROM plan_items WHERE status = 'completed'").get();
    const pendingCheckpoints = db.db.prepare("SELECT COUNT(*) as count FROM checkpoints WHERE verification_status = 'pending'").get();

    return new Response(JSON.stringify({
      server: 'agent-orchestrator',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      plans: {
        by_status: plans,
        total_items: totalItems?.count || 0,
        completed_items: completedItems?.count || 0
      },
      checkpoints: {
        pending: pendingCheckpoints?.count || 0
      }
    }), { status: 200 });
  },

  getAgentStatus() {
    const configs = {
      kimi: { available: !!(process.env.KIMI_API_KEY || process.env.OPENCODE_API_KEY) },
      deepseek: { available: !!process.env.DEEPSEEK_API_KEY },
      zen: { available: !!process.env.OPENCODE_API_KEY }
    };

    return new Response(JSON.stringify({
      agents: configs,
      timestamp: new Date().toISOString()
    }), { status: 200 });
  }
};

export default statusRouter;
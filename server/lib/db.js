import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.AGENT_ORCHESTRATOR_DB_PATH || join(__dirname, "..", "state", "db.sqlite");

class DB {
  constructor(dbPath) {
    const path = dbPath || process.env.AGENT_ORCHESTRATOR_DB_PATH || join(__dirname, "..", "state", "db.sqlite");
    const dir = dirname(path);
    if (dir && dir !== '.' && dir !== '/') {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {}
    }
    this.db = new Database(path, { create: true });
  }

  // Plans
  createPlan(plan) {
    const stmt = this.db.prepare(
      "INSERT INTO plans (id, title, plan_document, status, created_at, milestones_total, fallback_used) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const createdAt = plan.created_at || new Date().toISOString();
    stmt.run(plan.id, plan.title, plan.plan_document, plan.status || 'pending', createdAt, plan.milestones_total || 0, plan.fallback_used || 0);
    return this.getPlan(plan.id);
  }

  getPlan(id) {
    return this.db.prepare("SELECT * FROM plans WHERE id = ?").get(id);
  }

  getRecentPlan() {
    return this.db.prepare(
      "SELECT * FROM plans ORDER BY created_at DESC LIMIT 1"
    ).get();
  }

  updatePlanStatus(id, status) {
    const updates = { status };
    if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)) {
      updates.completed_at = new Date().toISOString();
    }
    const keys = Object.keys(updates);
    const sql = `UPDATE plans SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...keys.map(k => updates[k]), id);
    return this.getPlan(id);
  }

  updatePlanMilestones(id, completed) {
    this.db.prepare("UPDATE plans SET milestones_completed = ? WHERE id = ?").run(completed, id);
    return this.getPlan(id);
  }

  // Plan Items
  createPlanItem(item) {
    const stmt = this.db.prepare(
      "INSERT INTO plan_items (plan_id, idx, title, description, executor, status) VALUES (?, ?, ?, ?, ?, ?)"
    );
    stmt.run(item.plan_id, item.idx, item.title, item.description || '', item.executor, item.status || 'pending');
    return this.getPlanItem(item.plan_id, item.idx);
  }

  getPlanItem(planId, idx) {
    return this.db.prepare("SELECT * FROM plan_items WHERE plan_id = ? AND idx = ?").get(planId, idx);
  }

  getPlanItems(planId) {
    return this.db.prepare("SELECT * FROM plan_items WHERE plan_id = ? ORDER BY idx").all(planId);
  }

  updatePlanItemStatus(planId, idx, status, result = null) {
    const updates = { status };
    if (result !== null) updates.result = result;
    if (status === 'completed' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }
    const keys = Object.keys(updates);
    const sql = `UPDATE plan_items SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE plan_id = ? AND idx = ?`;
    this.db.prepare(sql).run(...keys.map(k => updates[k]), planId, idx);
    return this.getPlanItem(planId, idx);
  }

  // Checkpoints
  createCheckpoint(cp) {
    const stmt = this.db.prepare(
      "INSERT INTO checkpoints (id, plan_id, milestone_idx, agent_outputs, verification_status) VALUES (?, ?, ?, ?, ?)"
    );
    stmt.run(cp.id, cp.plan_id, cp.milestone_idx, JSON.stringify(cp.agent_outputs || {}), cp.verification_status || 'pending');
    return this.getCheckpoint(cp.id);
  }

  getCheckpoint(id) {
    return this.db.prepare("SELECT * FROM checkpoints WHERE id = ?").get(id);
  }

  verifyCheckpoint(id, status, feedback = null) {
    this.db.prepare(
      "UPDATE checkpoints SET verification_status = ?, verification_feedback = ?, verified_by = 'kimi', verified_at = ? WHERE id = ?"
    ).run(status, feedback, new Date().toISOString(), id);
    return this.getCheckpoint(id);
  }

  // Agent Threads
  createThread(thread) {
    const stmt = this.db.prepare(
      "INSERT INTO agent_threads (id, plan_id, context_window, layer_states) VALUES (?, ?, ?, ?)"
    );
    stmt.run(thread.id, thread.plan_id, JSON.stringify(thread.context_window || {}), JSON.stringify(thread.layer_states || {}));
    return this.getThread(thread.id);
  }

  getThread(id) {
    return this.db.prepare("SELECT * FROM agent_threads WHERE id = ?").get(id);
  }

  updateThread(id, updates) {
    const keys = Object.keys(updates);
    const datetimeFields = ['updated_at', 'created_at'];
    const sql = `UPDATE agent_threads SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
    const values = keys.map(k => {
      if (datetimeFields.includes(k)) return updates[k];
      if (typeof updates[k] === 'string') return updates[k];
      return JSON.stringify(updates[k]);
    });
    this.db.prepare(sql).run(...values, id);
    return this.getThread(id);
  }

  getRecentPlans(limit = 10) {
    return this.db.prepare(
      "SELECT * FROM plans ORDER BY created_at DESC LIMIT ?"
    ).all(limit);
  }

  // Messages
  createMessage(msg) {
    const stmt = this.db.prepare(
      "INSERT INTO messages (thread_id, agent, role, content) VALUES (?, ?, ?, ?)"
    );
    stmt.run(msg.thread_id, msg.agent, msg.role, msg.content);
    return this.db.prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY id DESC LIMIT 1").get(msg.thread_id);
  }

  getThreadMessages(threadId, limit = 50) {
    return this.db.prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY timestamp DESC LIMIT ?").all(threadId, limit);
  }

  // Activity Log
  logActivity(entry) {
    const stmt = this.db.prepare(
      "INSERT INTO activity_log (plan_id, agent, action, details) VALUES (?, ?, ?, ?)"
    );
    stmt.run(entry.plan_id || null, entry.agent || null, entry.action, JSON.stringify(entry.details || {}));
  }

  getActivityLog(planId, limit = 100) {
    return this.db.prepare("SELECT * FROM activity_log WHERE plan_id = ? ORDER BY timestamp DESC LIMIT ?").all(planId, limit);
  }

  cleanupActivityLog(days = 30) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    return this.db.prepare("DELETE FROM activity_log WHERE timestamp < ?").run(cutoff);
  }

  close() {
    this.db.close();
  }
}

let _default = null;
export function getDefaultDB() {
  if (!_default) _default = new DB();
  return _default;
}
export default new Proxy({}, {
  get(_, prop) {
    return getDefaultDB()[prop];
  }
});
export { DB };
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    plan_document TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    milestones_total INTEGER DEFAULT 0,
    milestones_completed INTEGER DEFAULT 0,
    fallback_used INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS plan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    executor TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  );
  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    milestone_idx INTEGER NOT NULL,
    agent_outputs TEXT,
    verification_status TEXT DEFAULT 'pending',
    verification_feedback TEXT,
    verified_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME,
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  );
  CREATE TABLE IF NOT EXISTS agent_threads (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    context_window TEXT,
    layer_states TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT NOT NULL,
    agent TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES agent_threads(id)
  );
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id TEXT,
    agent TEXT,
    action TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_plan_items_plan_id ON plan_items(plan_id);
  CREATE INDEX IF NOT EXISTS idx_checkpoints_plan_id ON checkpoints(plan_id);
  CREATE INDEX IF NOT EXISTS idx_activity_log_plan_id ON activity_log(plan_id);
  CREATE INDEX IF NOT EXISTS idx_plan_items_status ON plan_items(status);
  CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
`;

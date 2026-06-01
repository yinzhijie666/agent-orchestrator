import { Database } from "bun:sqlite";
import { dirname } from "node:path";

const DB_PATH = process.env.AGENT_ORCHESTRATOR_DB_PATH || "./server/state/db.sqlite";

function migrate() {
  const db = new Database(DB_PATH);
  
  // Check if fallback_used column exists
  const columns = db.prepare("PRAGMA table_info(plans)").all();
  const hasFallbackUsed = columns.some(col => col.name === 'fallback_used');
  
  if (!hasFallbackUsed) {
    console.log('[migrate] Adding fallback_used column to plans table...');
    db.exec("ALTER TABLE plans ADD COLUMN fallback_used INTEGER DEFAULT 0");
    console.log('[migrate] Column added successfully');
  } else {
    console.log('[migrate] fallback_used column already exists');
  }
  
  db.close();
  console.log('[migrate] Migration complete');
}

migrate();

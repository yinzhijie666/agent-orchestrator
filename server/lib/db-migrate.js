const MIGRATIONS = [
  {
    version: 1,
    name: "initial_schema",
    up: `SELECT 1`,
  },
];

export function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = db.prepare("SELECT version FROM _migrations").all().map(r => r.version);

  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.version)) {
      db.exec(migration.up);
      db.prepare("INSERT INTO _migrations (version, name) VALUES (?, ?)").run(migration.version, migration.name);
      console.log(`[db-migrate] Applied migration ${migration.version}: ${migration.name}`);
    }
  }
}

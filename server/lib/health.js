export function createHealthCheck(opts = {}) {
  const startTime = Date.now();
  const db = opts.db || null;

  return {
    liveness() {
      return {
        status: "ok",
        uptime: Math.floor((Date.now() - startTime) / 1000),
      };
    },

    readiness() {
      let dbOk = opts.dbOk !== undefined ? opts.dbOk : true;
      if (db && !opts.dbOk) {
        try {
          const r = db.query("SELECT 1").get();
          dbOk = r !== undefined;
        } catch {
          dbOk = false;
        }
      }

      return {
        status: dbOk ? "ok" : "degraded",
        database: dbOk ? "connected" : "error",
        uptime: Math.floor((Date.now() - startTime) / 1000),
      };
    },
  };
}

import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Config
import config from "./config/default.json" with { type: "json" };
import { SCHEMA_SQL } from "./lib/db-schema.js";
import { runMigrations } from "./lib/db-migrate.js";

// API Routers
import planRouter from "./api/plan.js";
import checkpointRouter from "./api/checkpoint.js";
import threadRouter from "./api/thread.js";
import statusRouter from "./api/status.js";
import internalEventRouter from "./api/internal-event.js";

// WebSocket
import { setupWebSocket, broadcaster } from "./websocket/server.js";
import { markAsServerProcess } from "./lib/events.js";
import { authenticate } from "./lib/auth.js";
markAsServerProcess();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize database
const DB_PATH = process.env.AGENT_ORCHESTRATOR_DB_PATH || join(__dirname, "state", "db.sqlite");
await mkdir(dirname(DB_PATH), { recursive: true });

const initDb = new Database(DB_PATH, { create: true });
initDb.exec(SCHEMA_SQL);
runMigrations(initDb);
initDb.close();
console.log(`[server] Database initialized at ${DB_PATH}`);

const PORT = parseInt(process.env.AGENT_ORCHESTRATOR_PORT) || config.server.port || 8765;
const HOST = config.server.host || "127.0.0.1";

// Request router
async function handleRequest(req) {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Auth check (skip dashboard and OPTIONS)
  if (path !== "/" && path !== "/dashboard") {
    const authError = authenticate(req);
    if (authError) {
      return new Response(JSON.stringify({ error: authError.error }), {
        status: authError.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

    try {
    let response;

    // Match routes
    const planMatch = path.match(/^\/api\/plans\/([^\/]+)\/activate$/);
    const planCompleteMatch = path.match(/^\/api\/plans\/([^\/]+)\/complete$/);
    const planItemMatch = path.match(/^\/api\/plans\/([^\/]+)\/items\/([^\/]+)$/);
    const planItemsMatch = path.match(/^\/api\/plans\/([^\/]+)\/items$/);
    const planIdMatch = path.match(/^\/api\/plans\/([^\/]+)$/);
    const checkpointVerifyMatch = path.match(/^\/api\/checkpoints\/([^\/]+)\/verify$/);
    const checkpointIdMatch = path.match(/^\/api\/checkpoints\/([^\/]+)$/);
    const threadMsgMatch = path.match(/^\/api\/threads\/([^\/]+)\/messages$/);
    const threadIdMatch = path.match(/^\/api\/threads\/([^\/]+)$/);

    if (path === "/api/plans" && method === "POST") {
      response = await planRouter.createPlan(req);
    } else if (planMatch && method === "POST") {
      response = await planRouter.activatePlan(req, { id: planMatch[1] });
    } else if (planCompleteMatch && method === "POST") {
      response = await planRouter.completePlan(req, { id: planCompleteMatch[1] });
    } else if (planItemMatch && method === "PATCH") {
      response = await planRouter.updatePlanItem(req, { id: planItemMatch[1], idx: planItemMatch[2] });
    } else if (planItemsMatch && method === "GET") {
      response = planRouter.getPlanItems(req, { id: planItemsMatch[1] });
    } else if (planIdMatch && method === "GET") {
      response = planRouter.getPlan(req, { id: planIdMatch[1] });
    } else if (path === "/api/checkpoints" && method === "POST") {
      response = await checkpointRouter.createCheckpoint(req);
    } else if (checkpointVerifyMatch && method === "PATCH") {
      response = await checkpointRouter.verifyCheckpoint(req, { id: checkpointVerifyMatch[1] });
    } else if (checkpointIdMatch && method === "GET") {
      response = checkpointRouter.getCheckpoint(req, { id: checkpointIdMatch[1] });
    } else if (path === "/api/checkpoints/pending" && method === "GET") {
      // This route is slightly different - accept plan_id as query param
      const planId = url.searchParams.get("plan_id");
      if (planId) {
        response = checkpointRouter.getPendingCheckpoints(req, { plan_id: planId });
      } else {
        response = new Response(JSON.stringify({ error: "plan_id query param required" }), { status: 400 });
      }
    } else if (path === "/api/threads" && method === "POST") {
      response = threadRouter.createThread(req);
    } else if (threadMsgMatch && method === "POST") {
      response = await threadRouter.appendMessage(req, { id: threadMsgMatch[1] });
    } else if (threadIdMatch && method === "GET") {
      response = threadRouter.getThread(req, { id: threadIdMatch[1] });
    } else if (path === "/api/status" && method === "GET") {
      response = statusRouter.getStatus();
    } else if (path === "/api/status/agents" && method === "GET") {
      response = statusRouter.getAgentStatus();
    } else if (path === "/api/internal/event" && method === "POST") {
      response = await internalEventRouter.handleEvent(req);
    } else if (path === "/" || path === "/dashboard") {
      // Serve dashboard
      const dashboardPath = join(__dirname, "dashboard", "index.html");
      const file = Bun.file(dashboardPath);
      return new Response(file, { 
        headers: { "Content-Type": "text/html", ...corsHeaders } 
      });
    } else {
      response = new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }

    // Add CORS headers to all responses
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;

  } catch (err) {
    console.error("[server] Request error:", err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: corsHeaders
    });
  }
}

// WebSocket handlers via setupWebSocket
const wsHandlers = setupWebSocket();

// Start server
const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: handleRequest,
  websocket: wsHandlers,
});

console.log(`
╔═══════════════════════════════════════════════════════════╗
║         🧠 Agent Orchestrator Server v1.0.0               ║
╠═══════════════════════════════════════════════════════════╣
║  HTTP:  http://${HOST}:${PORT}                            ║
║  WS:    ws://${HOST}:${PORT}                              ║
║  DB:    ${DB_PATH}                                        ║
╠═══════════════════════════════════════════════════════════╣
║  Endpoints:                                               ║
║    POST /api/plans          → Create plan                 ║
║    GET  /api/plans/:id      → Get plan                    ║
║    GET  /api/plans/:id/items → Get plan items             ║
║    PATCH /api/plans/:id/items/:idx → Update item status   ║
║    POST /api/plans/:id/activate → Activate plan           ║
║    POST /api/checkpoints    → Create checkpoint           ║
║    PATCH /api/checkpoints/:id/verify → Verify checkpoint  ║
║    GET  /api/threads/:id    → Get thread                  ║
║    POST /api/threads/:id/messages → Append message       ║
║    GET  /api/status         → Server status               ║
║    GET  /api/status/agents  → Agent availability          ║
╠═══════════════════════════════════════════════════════════╣
║  Dashboard: http://${HOST}:${PORT}/dashboard                ║
╚═══════════════════════════════════════════════════════════╝
`);

export { server };
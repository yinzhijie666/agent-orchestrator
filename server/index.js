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
import { authenticate, isOriginAllowed, ALLOWED_ORIGINS } from "./lib/auth.js";

// Structured logging + request tracing
import { Logger, runWithTraceId } from "./lib/logger.js";
import { extractRequestId, REQUEST_ID_HEADER } from "./lib/request-id.js";
import { RateLimiter } from "./lib/rate-limiter.js";
import { MetricsRegistry } from "./lib/metrics.js";
import { createHealthCheck } from "./lib/health.js";
import { versionPrefix } from "./lib/version-prefix.js";

const log = Logger("server");
const rateLimiter = new RateLimiter();
const metrics = new MetricsRegistry();
const httpRequests = metrics.counter("http_requests_total", "Total HTTP requests", ["method", "path"]);
const inFlight = metrics.gauge("http_requests_in_flight", "HTTP requests in flight");
const healthCheck = createHealthCheck();
let shuttingDown = false;
markAsServerProcess();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize database
const DB_PATH = process.env.AGENT_ORCHESTRATOR_DB_PATH || join(__dirname, "state", "db.sqlite");
await mkdir(dirname(DB_PATH), { recursive: true });

const initDb = new Database(DB_PATH, { create: true });
initDb.exec("PRAGMA journal_mode=WAL");
initDb.exec(SCHEMA_SQL);
runMigrations(initDb);
initDb.close();
log.info(`Database initialized at ${DB_PATH}`);

const PORT = parseInt(process.env.AGENT_ORCHESTRATOR_PORT) || config.server.port || 8765;
const HOST = config.server.host || "127.0.0.1";

// Request router
async function handleRequest(req, server) {
  const url = new URL(req.url);
  const method = req.method;
  const path = versionPrefix(url.pathname);

  // Graceful shutdown check
  if (shuttingDown) {
    return new Response(JSON.stringify({ error: "Server shutting down" }), { status: 503 });
  }

  // Request tracking
  inFlight.inc();
  const startMs = Date.now();
  const requestId = extractRequestId(req.headers, { generateIfMissing: true });

  // Rate limiting (skip for health/metrics)
  const skipPaths = ["/health", "/ready", "/metrics"];
  const shouldRateLimit = !skipPaths.includes(path);
  const clientKey = shouldRateLimit
    ? req.headers.get("Authorization") || req.headers.get("x-forwarded-for") || req.ip || "unknown"
    : "health";
  const rateResult = shouldRateLimit ? rateLimiter.check(clientKey) : { allowed: true, limit: 0, remaining: 0 };
  if (!rateResult.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rateResult.retryAfter),
        "x-ratelimit-limit": String(rateResult.limit),
        "x-ratelimit-remaining": "0",
        [REQUEST_ID_HEADER]: requestId,
      },
    });
  }

  // CORS headers
  const reqOrigin = req.headers.get("Origin");
  const allowedOrigin = reqOrigin && isOriginAllowed(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS()[0] || "*";
  const corsHeaders = {
    [REQUEST_ID_HEADER]: requestId,
    "Access-Control-Allow-Origin": allowedOrigin,
    "x-ratelimit-limit": String(rateResult.limit),
    "x-ratelimit-remaining": String(rateResult.remaining),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Auth check (skip public paths)
  const publicPaths = ["/", "/dashboard", "/health", "/ready", "/metrics"];
  if (!publicPaths.includes(path)) {
    const authError = authenticate(req);
    if (authError) {
      return new Response(JSON.stringify({ error: authError.error }), {
        status: authError.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  return runWithTraceId(requestId, async () => {
    try {
      let response;

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
      } else if (path === "/health" && method === "GET") {
        response = Response.json(healthCheck.liveness(), { headers: corsHeaders });
      } else if (path === "/ready" && method === "GET") {
        response = Response.json(healthCheck.readiness(), { headers: corsHeaders });
      } else if (path === "/metrics" && method === "GET") {
        response = new Response(metrics.prometheus(), {
          headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
        });
      } else if (path === "/" || path === "/dashboard") {
        if (server.upgrade(req)) return;
        const dashboardPath = join(__dirname, "dashboard", "index.html");
        const file = Bun.file(dashboardPath);
        return new Response(file, { headers: { "Content-Type": "text/html", ...corsHeaders } });
      } else {
        response = new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
      }

      Object.entries(corsHeaders).forEach(([key, value]) => {
        if (response?.headers) response.headers.set(key, value);
      });

      return response;

    } catch (err) {
      log.error({ err }, "Request error");
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: corsHeaders,
      });
    } finally {
      inFlight.dec();
      const duration = Date.now() - startMs;
      const durMs = metrics.gauge("http_request_duration_ms", "HTTP request duration");
      durMs.set(duration);
    }
  });
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
log.info({ port: PORT, host: HOST, db: DB_PATH }, "Server started");

// Graceful shutdown
const shutdown = async (signal) => {
  log.info({ signal }, "Shutting down");
  shuttingDown = true;
  try {
    server.stop();
    log.info("Server stopped");
  } catch (err) {
    log.error({ err }, "Shutdown error");
  }
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { server };
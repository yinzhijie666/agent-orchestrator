import { timingSafeEqual } from "crypto";

export function ALLOWED_ORIGINS() {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw.trim() === "") return ["*"];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

export function isOriginAllowed(origin) {
  if (!origin) return false;
  const allowed = ALLOWED_ORIGINS();
  if (allowed.includes("*")) return true;
  return allowed.some(a => origin === a || origin.startsWith(a + "/"));
}

export function authenticate(req) {
  const apiKeyConfig = process.env.AGENT_ORCHESTRATOR_API_KEY;
  if (!apiKeyConfig) return null;

  const validKeys = apiKeyConfig.split(",").map(s => s.trim()).filter(Boolean);
  if (validKeys.length === 0) return null;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: "Missing Authorization header", status: 401 };

  const token = authHeader.replace(/^Bearer\s+/i, "");

  const matched = validKeys.some(key => {
    if (token.length !== key.length) return false;
    try {
      return timingSafeEqual(Buffer.from(token), Buffer.from(key));
    } catch {
      return false;
    }
  });

  if (!matched) return { error: "Invalid API key", status: 401 };
  return null;
}

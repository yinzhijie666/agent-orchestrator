export function authenticate(req) {
  const apiKey = process.env.AGENT_ORCHESTRATOR_API_KEY;
  if (!apiKey) return null;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: "Missing Authorization header", status: 401 };

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== apiKey) return { error: "Invalid API key", status: 401 };

  return null;
}

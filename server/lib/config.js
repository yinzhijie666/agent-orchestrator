import rawConfig from "../config/default.json" with { type: "json" };

export const config = {
  server: {
    port: rawConfig.server?.port || 8765,
    host: rawConfig.server?.host || "127.0.0.1",
  },
  milestone: {
    interval: rawConfig.milestone?.interval || 4,
    verification_timeout_ms: rawConfig.milestone?.verification_timeout_ms || 300000,
  },
  models: rawConfig.models || {},
  auto_exec: {
    enabled: rawConfig.auto_exec?.enabled ?? true,
    max_skills: rawConfig.auto_exec?.max_skills || 20,
    model: rawConfig.auto_exec?.model || "cheap",
    timeout_ms: rawConfig.auto_exec?.timeout_ms || 90000,
    dispatcher: rawConfig.auto_exec?.dispatcher || { prefer: "run" },
  },
};

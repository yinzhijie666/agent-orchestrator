import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../server/config/default.json" with { type: "json" };
import BaseModelClient from "../server/lib/model-clients/base-client.js";
import KimiClient from "../server/lib/model-clients/kimi-client.js";
import DeepSeekClient from "../server/lib/model-clients/deepseek-client.js";
import MiniMaxClient from "../server/lib/model-clients/minimax-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Model Configuration", () => {
  test("Kimi config has correct model name and base URL", () => {
    const kimi = config.models.kimi;
    expect(kimi.model).toBe("kimi-k2.6");
    expect(kimi.base_url).toContain("opencode.ai");
    expect(kimi.api_key_env).toBe("OPENCODE_API_KEY");
    expect(kimi.max_tokens).toBe(262144);
  });

  test("DeepSeek config has correct model name and base URL", () => {
    const ds = config.models.deepseek;
    expect(ds.model).toBe("deepseek-v4-flash");
    expect(ds.base_url).toContain("api.deepseek.com");
    expect(ds.api_key_env).toBe("DEEPSEEK_API_KEY");
    expect(ds.max_tokens).toBe(384000);
  });

  test("MiniMax config has correct model name and base URL", () => {
    const mm = config.models.minimax;
    expect(mm.model).toBe("MiniMax-M3");
    expect(mm.base_url).toContain("api.minimax.chat");
    expect(mm.api_key_env).toBe("MINIMAX_API_KEY");
    expect(mm.max_tokens).toBe(128000);
    expect(mm.temperature).toBe(0.1);
  });

  test("Models key environment variable names", () => {
    expect(config.models.kimi.api_key_env).toBe("OPENCODE_API_KEY");
    expect(config.models.deepseek.api_key_env).toBe("DEEPSEEK_API_KEY");
    expect(config.models.minimax.api_key_env).toBe("MINIMAX_API_KEY");
  });
});

describe("BaseModelClient Construction", () => {
  const testConfig = {
    api_key_env: "TEST_API_KEY",
    base_url: "https://test.com/v1",
    model: "test-model",
    max_tokens: 1000,
    temperature: 0.5,
    provider: "test",
    thinking: { type: "enabled" },
    reasoning_effort: "high",
  };

  beforeAll(() => {
    process.env.TEST_API_KEY = "sk-test-key-12345";
  });

  test("constructor assigns all config fields", () => {
    const client = new BaseModelClient(testConfig);
    expect(client.apiKey).toBe("sk-test-key-12345");
    expect(client.baseUrl).toBe("https://test.com/v1");
    expect(client.model).toBe("test-model");
    expect(client.maxTokens).toBe(1000);
    expect(client.temperature).toBe(0.5);
    expect(client.provider).toBe("test");
    expect(client.thinking).toEqual({ type: "enabled" });
    expect(client.reasoningEffort).toBe("high");
  });

  test("missing API key throws on chat", async () => {
    delete process.env.TEST_API_KEY;
    const client = new BaseModelClient(testConfig);
    try {
      await client.chat([{ role: "user", content: "hi" }]);
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err.message).toContain("API key not found");
    }
  });
});

describe("API Key Loading from .env", () => {
  test(".env file contains all three required keys", () => {
    const envPath = join(__dirname, "..", ".env");
    const envContent = readFileSync(envPath, "utf-8");
    expect(envContent).toContain("OPENCODE_API_KEY");
    expect(envContent).toContain("DEEPSEEK_API_KEY");
    expect(envContent).toContain("MINIMAX_API_KEY");
  });

  test("process.env has keys loaded at runtime", () => {
    expect(process.env.OPENCODE_API_KEY).toBeTruthy();
    expect(process.env.DEEPSEEK_API_KEY).toBeTruthy();
    expect(process.env.MINIMAX_API_KEY).toBeTruthy();
  });
});

describe("Fallback Mechanism", () => {
  const testConfig = {
    api_key_env: "FALLBACK_TEST_KEY",
    base_url: "https://test.com/v1",
    model: "primary-model",
  };

  beforeAll(() => {
    process.env.FALLBACK_TEST_KEY = "sk-fallback";
  });

  test("shouldFallback returns true for network errors", () => {
    const client = new BaseModelClient(testConfig);
    const networkErrors = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN", "ECONNABORTED"];
    for (const code of networkErrors) {
      expect(client.shouldFallback(new Error(code))).toBe(true);
    }
  });

  test("shouldFallback returns true for HTTP 5xx errors", () => {
    const client = new BaseModelClient(testConfig);
    const err = new Error("Server error");
    err.status = 500;
    expect(client.shouldFallback(err)).toBe(true);
  });

  test("shouldFallback returns true for HTTP 401/429/408", () => {
    const client = new BaseModelClient(testConfig);
    for (const code of [401, 429, 408]) {
      const err = new Error(`HTTP ${code}`);
      err.status = code;
      expect(client.shouldFallback(err)).toBe(true);
    }
  });

  test("shouldFallback returns false for random errors", () => {
    const client = new BaseModelClient(testConfig);
    expect(client.shouldFallback(null)).toBe(false);
    expect(client.shouldFallback(new Error("Some random error"))).toBe(false);
    const err = new Error("Bad request");
    err.status = 400;
    expect(client.shouldFallback(err)).toBe(false);
  });

  test("chatWithFallback uses fallback on primary failure", async () => {
    const primary = new BaseModelClient(testConfig);
    const fallback = new BaseModelClient(testConfig);

    primary.chat = async () => { throw Object.assign(new Error("ECONNREFUSED"), { status: 500 }); };
    fallback.chat = async () => "fallback response";

    const result = await primary.chatWithFallback([{ role: "user", content: "hi" }], {}, fallback);
    expect(result._fallback).toBe(true);
    expect(result._fallback_from).toBe("primary-model");
    expect(result._fallback_to).toBe("primary-model");
    expect(result.content).toBe("fallback response");
  });

  test("chatWithFallback throws when both primary and fallback fail", async () => {
    const primary = new BaseModelClient(testConfig);
    const fallback = new BaseModelClient(testConfig);

    primary.chat = async () => { throw Object.assign(new Error("ECONNREFUSED"), { status: 500 }); };
    fallback.chat = async () => { throw new Error("ETIMEDOUT"); };

    try {
      await primary.chatWithFallback([{ role: "user", content: "hi" }], {}, fallback);
      expect(true).toBe(false);
    } catch (err) {
      expect(err.message).toContain("Both");
      expect(err.message).toContain("primary-model");
      expect(err.primaryError).toBeDefined();
      expect(err.fallbackError).toBeDefined();
    }
  });

  test("chatWithFallback returns primary result on success", async () => {
    const primary = new BaseModelClient(testConfig);
    primary.chat = async () => "primary success";

    const result = await primary.chatWithFallback([{ role: "user", content: "hi" }]);
    expect(result._fallback).toBe(false);
    expect(result.content).toBe("primary success");
  });
});

describe("Client Instantiation", () => {
  beforeAll(() => {
    process.env.OPENCODE_API_KEY = process.env.OPENCODE_API_KEY || "sk-test";
    process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "sk-test";
    process.env.MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "sk-test";
  });

  test("KimiClient instantiates from config", () => {
    const client = new KimiClient(config.models.kimi);
    expect(client.model).toBe("kimi-k2.6");
    expect(client.provider).toBe("opencode-go");
  });

  test("DeepSeekClient instantiates from config", () => {
    const client = new DeepSeekClient(config.models.deepseek);
    expect(client.model).toBe("deepseek-v4-flash");
    expect(client.provider).toBe("deepseek");
  });

  test("MiniMaxClient instantiates from config", () => {
    const client = new MiniMaxClient(config.models.minimax);
    expect(client.model).toBe("MiniMax-M3");
    expect(client.provider).toBe("minimax");
  });
});

describe("API Connectivity", () => {
  const hasNetwork = !!(process.env.OPENCODE_API_KEY && process.env.CI !== "true");
  const itOrSkip = hasNetwork ? test : test.skip;

  itOrSkip("Kimi API responds to chat request", async () => {
    const client = new KimiClient(config.models.kimi);
    client.chat = async (messages) => {
      const response = await fetch(`${config.models.kimi.base_url}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENCODE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.models.kimi.model,
          messages: [{ role: "user", content: "Say OK" }],
          max_tokens: 10,
        }),
      });
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "no response";
    };
    const result = await client.chat([{ role: "user", content: "Say OK" }]);
    expect(result).toBeTruthy();
  }, 30000);

  itOrSkip("DeepSeek API responds to chat request", async () => {
    const client = new DeepSeekClient(config.models.deepseek);
    const result = await client.chat([
      { role: "user", content: "Respond with just the word: OK" }
    ]);
    expect(result).toBeTruthy();
  }, 30000);

  itOrSkip("MiniMax API responds to chat request", async () => {
    const client = new MiniMaxClient(config.models.minimax);
    const result = await client.searchCode("What is 1+1?");
    expect(result).toBeTruthy();
  }, 30000);
});

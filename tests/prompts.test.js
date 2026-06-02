import { describe, test, expect, beforeEach } from "bun:test";
import KimiClient from "../server/lib/model-clients/kimi-client.js";
import DeepSeekClient from "../server/lib/model-clients/deepseek-client.js";
import MiniMaxClient from "../server/lib/model-clients/minimax-client.js";

const mockConfig = {
  api_key_env: "TEST_KEY",
  base_url: "https://test.com/v1",
  model: "test-model",
  max_tokens: 100000,
  temperature: 0.7,
  provider: "test",
};

function makeMockClient(ClientClass) {
  const client = new ClientClass(mockConfig);
  const sentMessages = [];
  client.chat = async (messages, opts = {}) => {
    sentMessages.push({ messages, opts });
    return JSON.stringify({ status: "completed", result: "mock" });
  };
  return { client, sentMessages };
}

describe("Kimi Prompts", () => {
  test("generatePlan system prompt includes executor options", async () => {
    const { client, sentMessages } = makeMockClient(KimiClient);
    await client.generatePlan("Test task");
    const systemMsg = sentMessages[0].messages[0].content;
    expect(systemMsg).toContain("structured plan documents");
    expect(systemMsg).toContain("kimi");
    expect(systemMsg).toContain("deepseek");
    expect(systemMsg).toContain("minimax");
  });

  test("generatePlan system prompt includes suggested_skills structure", async () => {
    const { client, sentMessages } = makeMockClient(KimiClient);
    await client.generatePlan("Test task");
    const systemMsg = sentMessages[0].messages[0].content;
    expect(systemMsg).toContain("P0_critical");
    expect(systemMsg).toContain("P1_important");
    expect(systemMsg).toContain("P2_nice_to_have");
  });

  test("generatePlan system prompt includes all capability categories", async () => {
    const { client, sentMessages } = makeMockClient(KimiClient);
    await client.generatePlan("Test task");
    const systemMsg = sentMessages[0].messages[0].content;
    expect(systemMsg).toContain("Superpowers[14]");
    expect(systemMsg).toContain("GStack[16]");
    expect(systemMsg).toContain("CodeGraph[9]");
    expect(systemMsg).toContain("云端[76类]");
  });

  test("generatePlan user message includes context and prompt", async () => {
    const { client, sentMessages } = makeMockClient(KimiClient);
    await client.generatePlan("Build auth system", "User login flow");
    const userMsg = sentMessages[0].messages[1].content;
    expect(userMsg).toContain("Context: User login flow");
    expect(userMsg).toContain("Task: Build auth system");
  });

  test("generatePlan calls chat with json_mode enabled", async () => {
    const { client, sentMessages } = makeMockClient(KimiClient);
    await client.generatePlan("Test");
    expect(sentMessages[0].opts.json_mode).toBe(true);
    expect(sentMessages[0].opts.max_tokens).toBe(8000);
  });

  test("analyzeTaskMode system prompt has plan/build decision", async () => {
    const client = new KimiClient(mockConfig);
    let capturedMessages;
    client.chat = async (messages) => {
      capturedMessages = messages;
      return JSON.stringify({ mode: "plan", reason: "analysis needed" });
    };
    await client.analyzeTaskMode("Research topic");
    const systemMsg = capturedMessages[0].content;
    expect(systemMsg).toContain('"plan"');
    expect(systemMsg).toContain('"build"');
  });

  test("analyzeTaskMode returns parsed JSON", async () => {
    const { client } = makeMockClient(KimiClient);
    client.chat = async () => JSON.stringify({ mode: "build", reason: "needs implementation" });
    const result = await client.analyzeTaskMode("Fix bug");
    expect(result.mode).toBe("build");
    expect(result.reason).toBe("needs implementation");
  });

  test("reviewCheckpoint builds checkpoint review prompt", async () => {
    const client = new KimiClient(mockConfig);
    let capturedMessages;
    client.chat = async (messages) => {
      capturedMessages = messages;
      return JSON.stringify({ status: "passed", feedback: "ok" });
    };
    const cp = { id: "cp1", plan_id: "p1", milestone_idx: 4 };
    await client.reviewCheckpoint(cp);
    const userMsg = capturedMessages[1].content;
    expect(userMsg).toContain("Review this checkpoint");
    expect(userMsg).toContain("cp1");
    expect(userMsg).toContain("Response format:");
  });

  test("parsePlan extracts suggested_skills as object", () => {
    const client = new KimiClient(mockConfig);
    const raw = JSON.stringify({
      title: "Test",
      items: [{ title: "Item 1", executor: "deepseek", description: "d" }],
      suggested_skills: { P0_critical: ["codegraph_context"], P1_important: ["/qa"] }
    });
    const plan = client.parsePlan(raw);
    expect(plan.suggested_skills.P0_critical).toContain("codegraph_context");
    expect(plan.suggested_skills.P1_important).toContain("/qa");
  });

  test("parsePlan handles array-format suggested_skills", () => {
    const client = new KimiClient(mockConfig);
    const raw = JSON.stringify({
      title: "Test",
      items: [{ title: "Item 1", executor: "deepseek", description: "d" }],
      suggested_skills: ["skill-a", "skill-b"]
    });
    const plan = client.parsePlan(raw);
    expect(plan.suggested_skills.P1_important).toEqual(["skill-a", "skill-b"]);
  });

  test("parsePlan handles null suggested_skills", () => {
    const client = new KimiClient(mockConfig);
    const raw = JSON.stringify({
      title: "Test",
      items: [{ title: "Item 1", executor: "deepseek", description: "d" }]
    });
    const plan = client.parsePlan(raw);
    expect(plan.suggested_skills).toEqual({});
  });
});

describe("DeepSeek Prompts", () => {
  test("executeTask system prompt is for implementation agent", async () => {
    const { client, sentMessages } = makeMockClient(DeepSeekClient);
    await client.executeTask({ title: "Fix bug", description: "Fix login issue", acceptance_criteria: "Login works" });
    const systemMsg = sentMessages[0].messages[0].content;
    expect(systemMsg).toContain("implementation agent");
    expect(systemMsg).toContain("status");
    expect(systemMsg).toContain("result");
    expect(systemMsg).toContain("deviations");
  });

  test("executeTask user message includes task fields", async () => {
    const { client, sentMessages } = makeMockClient(DeepSeekClient);
    await client.executeTask(
      { title: "Add auth", description: "JWT login", acceptance_criteria: "Test passes" },
      "Node.js project"
    );
    const userMsg = sentMessages[0].messages[1].content;
    expect(userMsg).toContain("Task: Add auth");
    expect(userMsg).toContain("Description: JWT login");
    expect(userMsg).toContain("Acceptance Criteria: Test passes");
    expect(userMsg).toContain("Context: Node.js project");
  });

  test("executeTask calls chat with json_mode", async () => {
    const { client, sentMessages } = makeMockClient(DeepSeekClient);
    await client.executeTask({ title: "T", description: "D", acceptance_criteria: "A" });
    expect(sentMessages[0].opts.json_mode).toBe(true);
    expect(sentMessages[0].opts.max_tokens).toBe(12000);
  });

  test("generateCode includes language in system prompt", async () => {
    const client = new DeepSeekClient(mockConfig);
    let capturedMessages;
    client.chat = async (messages) => {
      capturedMessages = messages;
      return "console.log('hello');";
    };
    await client.generateCode("Print hello", "typescript");
    const systemMsg = capturedMessages[0].content;
    expect(systemMsg).toContain("typescript developer");
  });

  test("parseExecutionResult handles valid JSON", () => {
    const client = new DeepSeekClient(mockConfig);
    const result = client.parseExecutionResult(
      JSON.stringify({ status: "completed", result: "Done", deviations: [] })
    );
    expect(result.status).toBe("completed");
    expect(result.result).toBe("Done");
  });

  test("parseExecutionResult falls back for non-JSON", () => {
    const client = new DeepSeekClient(mockConfig);
    const result = client.parseExecutionResult("Plain text output");
    expect(result.status).toBe("completed");
    expect(result.result).toBe("Plain text output");
  });
});

describe("MiniMax Prompts", () => {
  test("searchCode system prompt is for information retrieval", async () => {
    const { client, sentMessages } = makeMockClient(MiniMaxClient);
    await client.searchCode("Find auth code");
    const systemMsg = sentMessages[0].messages[0].content;
    expect(systemMsg).toContain("information retrieval agent");
  });

  test("searchCode caps codebase context at 2000 chars", async () => {
    const { client, sentMessages } = makeMockClient(MiniMaxClient);
    const longCodebase = "x".repeat(5000);
    await client.searchCode("Query", longCodebase);
    const userMsg = sentMessages[0].messages[1].content;
    expect(userMsg.length - (userMsg.indexOf("codebase context") >= 0 ? 0 : 0));
    const codebaseSection = userMsg.split("Codebase context")[1] || "";
    expect(codebaseSection.length).toBeLessThan(3000);
  });

  test("readFileSummary includes file path and content", async () => {
    const { client, sentMessages } = makeMockClient(MiniMaxClient);
    await client.readFileSummary("src/index.js", "const x = 1;");
    const userMsg = sentMessages[0].messages[1].content;
    expect(userMsg).toContain("File: src/index.js");
    expect(userMsg).toContain("const x = 1;");
  });

  test("readFileSummary caps content at 4000 chars", async () => {
    const { client, sentMessages } = makeMockClient(MiniMaxClient);
    const longContent = "y".repeat(10000);
    await client.readFileSummary("big.js", longContent);
    const userMsg = sentMessages[0].messages[1].content;
    const afterContent = userMsg.split("Content:")[1] || "";
    expect(afterContent.length).toBeLessThan(5000);
  });

  test("writeForbidden throws error", () => {
    const client = new MiniMaxClient(mockConfig);
    expect(() => client.writeForbidden()).toThrow("MiniMax agent is read-only");
  });

  test("batchQuery runs multiple searchCode calls", async () => {
    const { client } = makeMockClient(MiniMaxClient);
    client.searchCode = async (q) => `result for ${q}`;
    const results = await client.batchQuery(["q1", "q2", "q3"]);
    expect(results).toHaveLength(3);
    expect(results[0]).toBe("result for q1");
    expect(results[2]).toBe("result for q3");
  });
});

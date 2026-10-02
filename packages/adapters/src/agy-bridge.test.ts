import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  createAgyBridge,
  DEFAULT_AGY_MODELS,
  parseToolCall,
} from "../../../scripts/agy-bridge/server.mjs";
import { PiAgentRuntime } from "./pi-runtime.js";

describe("AGY Bridge Unit & Protocol Tests", () => {
  it("builds a structured prompt with system instructions and tools", () => {
    const messages = [
      { role: "system", content: "You are a test bot." },
      { role: "user", content: "Write a note." },
    ];
    const tools = [
      {
        type: "function",
        function: {
          name: "write_file",
          description: "Write content to a file",
          parameters: {
            type: "object",
            properties: { path: { type: "string" }, content: { type: "string" } },
          },
        },
      },
    ];

    const prompt = buildPrompt(messages, tools);
    expect(prompt).toContain("=== SYSTEM INSTRUCTIONS ===");
    expect(prompt).toContain("You are a test bot.");
    expect(prompt).toContain("=== AVAILABLE TOOLS ===");
    expect(prompt).toContain("- Tool: write_file");
    expect(prompt).toContain("TOOL INVOCATION RULES:");
    expect(prompt).toContain("User: Write a note.");
  });

  it("parses tool calls from markdown code fences", () => {
    const tools = [{ name: "write_file" }, { name: "read_file" }];
    const response =
      'Here is the file:\n```json\n{"tool": "write_file", "args": {"path": "test.txt", "content": "hello"}}\n```';

    const parsed = parseToolCall(response, tools);
    expect(parsed).toEqual({
      name: "write_file",
      args: { path: "test.txt", content: "hello" },
    });
  });

  it("parses tool calls from direct JSON", () => {
    const tools = [{ name: "write_file" }];
    const response = '{"tool": "write_file", "args": {"path": "test.txt", "content": "world"}}';

    const parsed = parseToolCall(response, tools);
    expect(parsed).toEqual({
      name: "write_file",
      args: { path: "test.txt", content: "world" },
    });
  });

  it("returns null when the response is ordinary text", () => {
    const tools = [{ name: "write_file" }];
    const response = "Hello! I am ready to help you.";

    const parsed = parseToolCall(response, tools);
    expect(parsed).toBeNull();
  });

  it("serves health and models endpoints", async () => {
    const bridge = createAgyBridge();
    const addr = await bridge.listen(0, "127.0.0.1");

    try {
      const healthRes = await fetch(`http://127.0.0.1:${(addr as { port: number }).port}/health`);
      expect(healthRes.status).toBe(200);
      const healthJson = (await healthRes.json()) as { status: string };
      expect(healthJson.status).toBe("ok");

      const modelsRes = await fetch(
        `http://127.0.0.1:${(addr as { port: number }).port}/v1/models`,
      );
      expect(modelsRes.status).toBe(200);
      const modelsJson = (await modelsRes.json()) as {
        object: string;
        data: Array<{ id: string }>;
      };
      expect(modelsJson.object).toBe("list");
      expect(modelsJson.data.length).toBe(DEFAULT_AGY_MODELS.length);
      expect(modelsJson.data.map((m) => m.id)).toContain("gemini-3.8-flash-high");
    } finally {
      await bridge.close();
    }
  });

  it("executes an end-to-end multi-turn tool calling loop with PiAgentRuntime", async () => {
    let turn = 0;
    const bridge = createAgyBridge({
      runAgy: async () => {
        turn++;
        if (turn === 1) {
          // Turn 1: Model decides to call write_file
          return '```json\n{"tool": "write_file", "args": {"path": "hello.txt", "content": "world"}}\n```';
        }
        // Turn 2: Model sees tool result and confirms
        return "I have successfully written 'world' to hello.txt!";
      },
    });

    const addr = await bridge.listen(0, "127.0.0.1");
    const baseUrl = `http://127.0.0.1:${(addr as { port: number }).port}/v1`;

    try {
      const executedCalls: Array<{
        name: string;
        args: Record<string, unknown>;
        executionId: string;
      }> = [];
      const runtime = new PiAgentRuntime();

      const events = [];
      const runStream = runtime.run({
        botId: "test-bot",
        threadId: "test-thread",
        runId: "test-run-1",
        prompt: "Please write 'world' to hello.txt.",
        instructions: "You are a helpful file assistant.",
        history: [],
        tools: [
          {
            name: "write_file",
            description: "Write content to a file",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string" },
                content: { type: "string" },
              },
              required: ["path", "content"],
              additionalProperties: false,
            },
          },
        ],
        model: {
          provider: "openai-compatible",
          id: "gemini-3.8-flash-high",
          baseUrl,
          apiKey: "local",
        },
        async executeTool(name, args, executionId) {
          executedCalls.push({ name, args, executionId });
          return { status: "success", bytes: 5 };
        },
      });

      for await (const event of runStream) {
        events.push(event);
      }

      // Verify tool was called by Pi
      expect(executedCalls).toHaveLength(1);
      expect(executedCalls[0]?.name).toBe("write_file");
      expect(executedCalls[0]?.args).toEqual({ path: "hello.txt", content: "world" });

      // Verify text was streamed back and completed
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent?.text).toContain("successfully written");
    } finally {
      await bridge.close();
    }
  });

  it("executes a live prompt through the real agy CLI", async () => {
    const bridge = createAgyBridge();
    const addr = await bridge.listen(0, "127.0.0.1");

    try {
      const response = await fetch(
        `http://127.0.0.1:${(addr as { port: number }).port}/v1/chat/completions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gemini-3.8-flash-high",
            messages: [{ role: "user", content: "Reply with the single word 'PONG'" }],
            stream: false,
          }),
        },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(data.choices[0]?.message.content.toUpperCase()).toContain("PONG");
    } finally {
      await bridge.close();
    }
  }, 60_000);
});

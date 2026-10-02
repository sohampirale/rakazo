import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

export const DEFAULT_AGY_MODELS = [
  { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)", reasoning: true },
  { id: "gemini-3.7-flash-high", name: "Gemini 3.7 Flash (High)", reasoning: true },
  { id: "gemini-3.6-flash-high", name: "Gemini 3.6 Flash (High)", reasoning: true },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking)", reasoning: true },
  { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)", reasoning: true },
  { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro (High)", reasoning: true },
];

/**
 * Builds an AGY-compatible prompt from OpenAI chat messages and tools.
 */
export function buildPrompt(messages, tools = []) {
  const parts = [];

  const systemMessages = messages.filter((m) => m.role === "system");
  if (systemMessages.length > 0) {
    parts.push("=== SYSTEM INSTRUCTIONS ===");
    for (const msg of systemMessages) {
      parts.push(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
    }
    parts.push("===========================\n");
  }

  if (tools && tools.length > 0) {
    parts.push("=== AVAILABLE TOOLS ===");
    parts.push("You have access to the following tools:");
    for (const tool of tools) {
      const fn = tool.function || tool;
      parts.push(`- Tool: ${fn.name}`);
      if (fn.description) parts.push(`  Description: ${fn.description}`);
      if (fn.parameters) parts.push(`  Parameters JSON Schema: ${JSON.stringify(fn.parameters)}`);
    }
    parts.push("\nTOOL INVOCATION RULES:");
    parts.push(
      "1. When you need to call a tool, respond ONLY with a JSON block in this exact format:",
    );
    parts.push("```json");
    parts.push('{\n  "tool": "<tool_name>",\n  "args": { <parameters_matching_schema> }\n}');
    parts.push("```");
    parts.push(
      "Do NOT add conversational text before or after the JSON block when calling a tool.",
    );
    parts.push(
      "2. If you do NOT need to call a tool, respond directly to the user in plain text without any tool JSON.",
    );
    parts.push("========================\n");
  }

  parts.push("=== CONVERSATION HISTORY ===");
  const nonSystem = messages.filter((m) => m.role !== "system");
  for (const msg of nonSystem) {
    if (msg.role === "user") {
      parts.push(
        `User: ${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`,
      );
    } else if (msg.role === "assistant") {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          const fnName = tc.function?.name || tc.name;
          const fnArgs = tc.function?.arguments || tc.arguments;
          parts.push(
            `Assistant: [Tool Call: ${fnName} args=${typeof fnArgs === "string" ? fnArgs : JSON.stringify(fnArgs)}]`,
          );
        }
      } else if (msg.content) {
        parts.push(
          `Assistant: ${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`,
        );
      }
    } else if (msg.role === "tool") {
      parts.push(
        `[Tool Result for ID ${msg.tool_call_id || "call"}]: ${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`,
      );
    }
  }
  parts.push("============================\n");
  parts.push("Assistant:");
  return parts.join("\n");
}

/**
 * Parses tool call JSON from the LLM's response if it matches one of the declared tools.
 */
export function parseToolCall(responseContent, declaredTools = []) {
  if (!declaredTools || declaredTools.length === 0) return null;
  const toolNames = new Set(declaredTools.map((t) => t.function?.name || t.name));

  // 1. Try markdown fence: ```json { ... } ```
  const fenceMatch = responseContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      const name = parsed.tool || parsed.name || parsed.function?.name;
      const args =
        parsed.args || parsed.arguments || parsed.parameters || parsed.function?.arguments || {};
      if (name && toolNames.has(name)) {
        return { name, args: typeof args === "string" ? JSON.parse(args) : args };
      }
    } catch {}
  }

  // 2. Try whole-string JSON
  const trimmed = responseContent.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const name = parsed.tool || parsed.name || parsed.function?.name;
      const args =
        parsed.args || parsed.arguments || parsed.parameters || parsed.function?.arguments || {};
      if (name && toolNames.has(name)) {
        return { name, args: typeof args === "string" ? JSON.parse(args) : args };
      }
    } catch {}
  }

  // 3. Try embedded JSON object containing "tool": or "name":
  const embeddedMatch = responseContent.match(
    /\{[\s\S]*?"(?:tool|name)"\s*:\s*"([^"]+)"[\s\S]*?\}/,
  );
  if (embeddedMatch) {
    try {
      const parsed = JSON.parse(embeddedMatch[0]);
      const name = parsed.tool || parsed.name || parsed.function?.name;
      const args =
        parsed.args || parsed.arguments || parsed.parameters || parsed.function?.arguments || {};
      if (name && toolNames.has(name)) {
        return { name, args: typeof args === "string" ? JSON.parse(args) : args };
      }
    } catch {}
  }

  return null;
}

/**
 * Spawns agy CLI non-interactively.
 */
export function runAgy({
  model = "gemini-3.8-flash-high",
  prompt,
  agyBinary = "agy",
  cwd = "/tmp",
  timeoutMs = 120_000,
}) {
  return new Promise((resolve, reject) => {
    const args = [
      "--model",
      model,
      "--disable-slash-commands",
      "-p",
      prompt,
      "--output-format",
      "text",
    ];

    const child = spawn(agyBinary, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`agy CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`agy exited with code ${code}: ${stderr || stdout}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Creates the OpenAI-compatible HTTP server.
 */
export function createAgyBridge(options = {}) {
  const agyBinary = options.agyBinary || "agy";
  const runAgyFn = options.runAgy || runAgy;
  const models = options.models || DEFAULT_AGY_MODELS;

  const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "agy-openai-bridge",
          version: "1.0.0",
          models: models.map((m) => m.id),
        }),
      );
      return;
    }

    if (req.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: models.map((m) => ({
            id: m.id,
            object: "model",
            created: Math.floor(Date.now() / 1000),
            owned_by: "antigravity",
          })),
        }),
      );
      return;
    }

    if (
      req.method === "POST" &&
      (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions")
    ) {
      let bodyText = "";
      for await (const chunk of req) {
        bodyText += chunk.toString("utf8");
      }

      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch (_err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { message: "Invalid JSON body", type: "invalid_request_error" },
          }),
        );
        return;
      }

      const {
        model = "gemini-3.8-flash-high",
        messages = [],
        tools = [],
        stream = false,
      } = payload;

      const completionId = `chatcmpl-${randomUUID()}`;
      const prompt = buildPrompt(messages, tools);

      try {
        const rawOutput = await runAgyFn({
          model,
          prompt,
          agyBinary,
          cwd: options.cwd || "/tmp",
          timeoutMs: options.timeoutMs || 120_000,
        });

        const toolCall = parseToolCall(rawOutput, tools);

        if (stream) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          const emitChunk = (delta, finishReason = null) => {
            res.write(
              `data: ${JSON.stringify({
                id: completionId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta, finish_reason: finishReason }],
              })}\n\n`,
            );
          };

          emitChunk({ role: "assistant" });

          if (toolCall) {
            const toolCallId = `call_${randomUUID().slice(0, 8)}`;
            emitChunk({
              tool_calls: [
                {
                  index: 0,
                  id: toolCallId,
                  type: "function",
                  function: {
                    name: toolCall.name,
                    arguments: "",
                  },
                },
              ],
            });

            emitChunk({
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: JSON.stringify(toolCall.args),
                  },
                },
              ],
            });

            emitChunk({}, "tool_calls");
          } else {
            const cleanText = rawOutput.trim();
            // Emit content in reasonable pieces
            const chunkSize = 64;
            for (let i = 0; i < cleanText.length; i += chunkSize) {
              emitChunk({ content: cleanText.slice(i, i + chunkSize) });
            }
            emitChunk({}, "stop");
          }

          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          if (toolCall) {
            const toolCallId = `call_${randomUUID().slice(0, 8)}`;
            res.end(
              JSON.stringify({
                id: completionId,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: toolCallId,
                          type: "function",
                          function: {
                            name: toolCall.name,
                            arguments: JSON.stringify(toolCall.args),
                          },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              }),
            );
          } else {
            res.end(
              JSON.stringify({
                id: completionId,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: rawOutput.trim(),
                    },
                    finish_reason: "stop",
                  },
                ],
              }),
            );
          }
        }
      } catch (err) {
        console.error("agy execution failed:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: err.message, type: "server_error" } }));
        } else {
          res.end();
        }
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Not Found", type: "not_found" } }));
  });

  return {
    server,
    listen(port = 4000, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections?.();
      });
    },
  };
}

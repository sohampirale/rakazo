#!/usr/bin/env node
import { createAgyBridge } from "./agy-bridge/server.mjs";

const port = Number(process.env.AGY_BRIDGE_PORT) || 4000;
const host = process.env.AGY_BRIDGE_HOST || "127.0.0.1";
const agyBinary = process.env.AGY_BINARY || "agy";

console.log("=================================================");
console.log("   Rakazo <-> Antigravity (AGY) OpenAI Bridge    ");
console.log("=================================================");
console.log(`Checking agy binary: ${agyBinary}`);

const bridge = createAgyBridge({ agyBinary });

try {
  const addr = await bridge.listen(port, host);
  console.log(`✓ AGY Bridge running on http://${addr.address}:${addr.port}/v1`);
  console.log(`✓ Models endpoint: http://${addr.address}:${addr.port}/v1/models`);
  console.log(`✓ Chat completions: http://${addr.address}:${addr.port}/v1/chat/completions`);
  console.log("");
  console.log("To use with Rakazo:");
  console.log("Add to your .env:");
  console.log(`  RAKAZO_LOCAL_MODELS_URL=http://${addr.address}:${addr.port}/v1`);
  console.log(
    "  RAKAZO_LOCAL_MODELS=gemini-3.8-flash-high,claude-sonnet-4-6,claude-opus-4-6-thinking",
  );
  console.log("=================================================");

  const shutdown = async () => {
    console.log("\nShutting down AGY bridge...");
    await bridge.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (err) {
  console.error("Failed to start AGY bridge:", err);
  process.exit(1);
}

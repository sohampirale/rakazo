#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

console.log("=================================================");
console.log("   Rakazo 24/7 Background Host & Cloudflare     ");
console.log("=================================================");

// 1. Ensure Postgres container is up
console.log("🐘 1. Ensuring Postgres database is up...");
const compose = spawn(
  "docker",
  [
    "compose",
    "--env-file",
    ".env",
    "-f",
    "infra/compose/docker-compose.yml",
    "-f",
    "infra/compose/docker-compose.postgres-host.yml",
    "up",
    "postgres",
    "-d",
  ],
  { stdio: "inherit" },
);

await new Promise((resolve, reject) => {
  compose.on("close", (code) =>
    code === 0 ? resolve() : reject(new Error(`Docker compose exited with code ${code}`)),
  );
});

// 2. Ensure Prisma client is in sync
console.log("🔄 2. Ensuring Prisma client is generated...");
const dbGen = spawn("pnpm", ["db:generate"], { stdio: "inherit" });
await new Promise((resolve, reject) => {
  dbGen.on("close", (code) =>
    code === 0 ? resolve() : reject(new Error(`pnpm db:generate exited with code ${code}`)),
  );
});

// 3. Start AGY Bridge
console.log("🤖 3. Starting AGY Bridge...");
const bridge = spawn("node", ["scripts/agy-bridge.mjs"], { stdio: "inherit" });

// 4. Start Rakazo Dev Stack
console.log("🚀 4. Launching Rakazo dev stack (Web :5173, API :3100, Worker, Supervisor)...");
const dev = spawn("pnpm", ["dev"], { stdio: "inherit" });

// 5. Wait for Web port 5173 to be ready
async function waitForPort(port, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
          if (res.statusCode) resolve();
          else reject(new Error("No status"));
        });
        req.on("error", reject);
        req.setTimeout(2000, () => req.destroy());
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

console.log("⏳ 5. Waiting for Rakazo Web UI to become ready on port 5173...");
const isReady = await waitForPort(5173);
if (!isReady) {
  console.error("❌ Port 5173 did not respond in time!");
} else {
  console.log("✓ Rakazo Web UI is responding on http://127.0.0.1:5173");
}

// 6. Start Cloudflare Tunnel
console.log("🌐 6. Launching Cloudflare Tunnel for public access...");
const cloudflared = spawn(
  "/home/soham/.local/bin/cloudflared",
  ["tunnel", "--url", "http://127.0.0.1:5173", "--http-host-header", "localhost"],
  { stdio: ["ignore", "pipe", "pipe"] },
);

let publicUrl = null;

function handleTunnelOutput(data) {
  const text = data.toString();
  process.stdout.write(text);
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && !publicUrl) {
    publicUrl = match[0];
    console.log("\n=======================================================");
    console.log(`🎉 RAKAZO IS LIVE ONLINE AT: ${publicUrl}`);
    console.log("=======================================================\n");

    // Save to project and home directory
    writeFileSync(path.resolve(process.cwd(), "PUBLIC_URL.txt"), `${publicUrl}\n`);
    try {
      writeFileSync("/home/soham/RAKAZO_PUBLIC_URL.txt", `${publicUrl}\n`);
    } catch {}

    // Send WhatsApp notification to Soham (+91 8208363244) with auto-retry
    const sendNotification = async (url, maxAttempts = 6) => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`📱 Sending WhatsApp notification (attempt ${attempt}/${maxAttempts})...`);
          const exitCode = await new Promise((resolve) => {
            const notify = spawn("python3", [
              "/home/soham/.gemini/config/skills/whatsapp-sender/scripts/send_whatsapp.py",
              "--text",
              `🚀 Rakazo Grok Bot is online!\nAccess your bots from anywhere:\n${url}`,
            ]);
            notify.stdout.on("data", (d) => process.stdout.write(d.toString()));
            notify.stderr.on("data", (d) => process.stderr.write(d.toString()));
            notify.on("close", resolve);
          });
          if (exitCode === 0) {
            console.log("✅ WhatsApp delivery confirmed!");
            return;
          }
        } catch (err) {
          console.error(`WhatsApp notification error on attempt ${attempt}:`, err);
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    };
    void sendNotification(publicUrl);
  }
}

cloudflared.stdout.on("data", handleTunnelOutput);
cloudflared.stderr.on("data", handleTunnelOutput);

const shutdown = () => {
  console.log("\n🛑 Stopping Rakazo background stack...");
  try {
    cloudflared.kill("SIGINT");
  } catch {}
  try {
    bridge.kill("SIGINT");
  } catch {}
  try {
    dev.kill("SIGINT");
  } catch {}
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

dev.on("close", (code) => {
  shutdown();
});

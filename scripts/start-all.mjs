#!/usr/bin/env node
import { spawn } from "node:child_process";

console.log("=================================================");
console.log("          Starting Rakazo with AGY Stack         ");
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

console.log("✓ Postgres is running on port 5434.\n");

// 2. Start AGY Bridge
console.log("🤖 2. Starting AGY Bridge (http://127.0.0.1:4000/v1)...");
const bridge = spawn("node", ["scripts/agy-bridge.mjs"], { stdio: "inherit" });

// 3. Start Rakazo Dev Stack
console.log("🚀 3. Launching Rakazo dev stack (Web :5173, API :3100, Worker, Supervisor)...");
const dev = spawn("pnpm", ["dev"], { stdio: "inherit" });

const shutdown = () => {
  console.log("\n🛑 Stopping Rakazo and AGY Bridge...");
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
  try {
    bridge.kill("SIGINT");
  } catch {}
  process.exit(code ?? 0);
});

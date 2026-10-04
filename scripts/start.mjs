#!/usr/bin/env node
import { spawn } from "node:child_process";

console.log("=================================================");
console.log("               Starting Rakazo Dev               ");
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

// 2. Start Rakazo Dev Stack
console.log("🚀 2. Launching Rakazo dev stack (Web :5173, API :3100, Worker, Supervisor)...");
const dev = spawn("pnpm", ["dev"], { stdio: "inherit" });

const shutdown = () => {
  console.log("\n🛑 Stopping Rakazo...");
  try {
    dev.kill("SIGINT");
  } catch {}
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

dev.on("close", (code) => {
  process.exit(code ?? 0);
});

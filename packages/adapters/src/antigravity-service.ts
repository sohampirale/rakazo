import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";

export interface AntigravityJob {
  jobId: string;
  projectPath: string;
  instructions: string;
  status: "running" | "success" | "failed";
  exitCode: number | null;
  startedAt: string;
  completedAt: string | null;
  logPath: string;
  summary?: string;
  error?: string;
}

const JOBS_DIR = join(homedir(), ".rakazo", "antigravity-jobs");
const activeJobs = new Map<string, AntigravityJob>();

function ensureJobsDir(): string {
  if (!existsSync(JOBS_DIR)) {
    mkdirSync(JOBS_DIR, { recursive: true });
  }
  return JOBS_DIR;
}

export function resolveAntigravityBin(): string {
  const custom = process.env.ANTIGRAVITY_BIN?.trim();
  if (custom && existsSync(custom)) return custom;

  const defaultLocal = join(homedir(), ".local", "bin", "agy");
  if (existsSync(defaultLocal)) return defaultLocal;

  try {
    const which = execSync("which agy", { encoding: "utf-8" }).trim();
    if (which && existsSync(which)) return which;
  } catch {
    // Ignore which failure
  }
  return "agy";
}

export function resolveProjectPath(inputPath: string): string {
  let cleaned = inputPath.trim();
  if (cleaned.startsWith("~/") || cleaned === "~") {
    cleaned = join(homedir(), cleaned.slice(1));
  }
  return isAbsolute(cleaned) ? cleaned : resolve(process.cwd(), cleaned);
}

export interface DispatchTaskInput {
  projectPath: string;
  instructions: string;
  threadId: string;
  botId: string;
  spaceId: string;
  userId: string;
  events?: ThreadEvents;
  prisma?: PrismaClient;
}

export async function dispatchAntigravityTask(input: DispatchTaskInput): Promise<{
  ok: boolean;
  jobId: string;
  status: string;
  projectPath: string;
  message: string;
  error?: string;
}> {
  const targetDir = resolveProjectPath(input.projectPath);
  if (!existsSync(targetDir)) {
    return {
      ok: false,
      jobId: "",
      status: "error",
      projectPath: targetDir,
      message: `Target directory '${targetDir}' does not exist on host machine.`,
      error: `Directory not found: ${targetDir}`,
    };
  }

  const jobId = `agy_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const jobsDir = ensureJobsDir();
  const logPath = join(jobsDir, `${jobId}.log`);
  const metaPath = join(jobsDir, `${jobId}.json`);

  const job: AntigravityJob = {
    jobId,
    projectPath: targetDir,
    instructions: input.instructions,
    status: "running",
    exitCode: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    logPath,
  };

  activeJobs.set(jobId, job);
  writeFileSync(metaPath, JSON.stringify(job, null, 2));

  const agyBin = resolveAntigravityBin();
  const logFd = openSync(logPath, "a");

  const childEnv = {
    ...process.env,
    PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
  };

  const args = [
    "-p",
    input.instructions,
    "--mode",
    "accept-edits",
    "--dangerously-skip-permissions",
    "--print-timeout",
    "0",
  ];

  getLogger().info(`[Antigravity] Spawning ${agyBin} for job ${jobId} in ${targetDir}`);

  const child = spawn(agyBin, args, {
    cwd: targetDir,
    env: childEnv,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });

  child.unref();

  child.on("close", async (code) => {
    const finishedAt = new Date().toISOString();
    job.exitCode = code;
    job.status = code === 0 ? "success" : "failed";
    job.completedAt = finishedAt;

    let logContent = "";
    try {
      if (existsSync(logPath)) {
        logContent = readFileSync(logPath, "utf-8").trim();
      }
    } catch {
      // Ignore log read error
    }

    let gitSummary = "";
    try {
      if (existsSync(join(targetDir, ".git"))) {
        const status = execSync("git status -s", { cwd: targetDir, encoding: "utf-8" }).trim();
        const diffStat = execSync("git diff --stat HEAD~1 2>/dev/null || git diff --stat", {
          cwd: targetDir,
          encoding: "utf-8",
        }).trim();
        if (status || diffStat) {
          gitSummary = `\nGit Changes:\n${status}\n\nDiff Summary:\n${diffStat}`;
        }
      }
    } catch {
      // Ignore git inspection error
    }

    const summary = logContent ? logContent.slice(-2000) : "Task completed.";
    job.summary = `${summary}${gitSummary ? `\n\n${gitSummary}` : ""}`;

    writeFileSync(metaPath, JSON.stringify(job, null, 2));
    activeJobs.set(jobId, job);

    getLogger().info(
      `[Antigravity] Job ${jobId} completed with code ${code}. Status: ${job.status}`,
    );

    // Notify thread via Rakazo events
    if (input.events) {
      try {
        const reportPrompt = `[System Notification: Antigravity Background Task Complete]\n\nJob ID: ${jobId}\nTarget Project: ${targetDir}\nStatus: ${job.status.toUpperCase()}\n\nSummary of Work Done:\n${job.summary}\n\nPlease inform the user that Antigravity has completed their task and present the summary concisely.`;

        await input.events.sendUserMessage({
          spaceId: input.spaceId,
          threadId: input.threadId,
          botId: input.botId,
          userId: input.userId,
          prompt: reportPrompt,
          blocks: [
            {
              kind: "text",
              text: `Antigravity background task ${jobId} has finished (${job.status.toUpperCase()}).`,
            },
          ],
          trigger: "webhook",
          createRun: true,
        });
      } catch (err) {
        getLogger().error(`[Antigravity] Failed to deliver completion notice to thread:`, err);
      }
    }
  });

  return {
    ok: true,
    jobId,
    status: "started",
    projectPath: targetDir,
    message: `Antigravity background task ${jobId} started in '${targetDir}'. Inform the user the task is in progress and that you are standing by until Antigravity notifies you of completion.`,
  };
}

export function getAntigravityTaskStatus(jobId: string): {
  found: boolean;
  job?: AntigravityJob;
  tail?: string;
} {
  let job = activeJobs.get(jobId);
  if (!job) {
    const metaPath = join(ensureJobsDir(), `${jobId}.json`);
    if (existsSync(metaPath)) {
      try {
        job = JSON.parse(readFileSync(metaPath, "utf-8"));
        if (job) activeJobs.set(jobId, job);
      } catch {
        // Ignore parse error
      }
    }
  }

  if (!job) {
    return { found: false };
  }

  let tail = "";
  if (existsSync(job.logPath)) {
    try {
      const full = readFileSync(job.logPath, "utf-8");
      const lines = full.split("\n");
      tail = lines.slice(-20).join("\n");
    } catch {
      // Ignore
    }
  }

  return {
    found: true,
    job,
    tail,
  };
}

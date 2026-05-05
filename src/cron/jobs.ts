import * as path from "path";
import * as fs from "fs";
import { RuntimeResult, RuntimeSpec } from "../types.js";
import {
  ensureWithinWorkspace,
  ensureWorkspaceState,
  workspaceRoot,
} from "../workspace.js";
import { readJson, writeJson } from "../util/json.js";
import { runSpec } from "../engine/spawn.js";
import { DEFAULT_RUNTIME_TIMEOUT_MS } from "../engine/constants.js";
import { classifyCommandRisk } from "../engine/risk.js";
import { redactText } from "../util/redact.js";
import { appendMetricEvent } from "../metrics/events.js";

export type CronJob = {
  id: string;
  command: string;
  args: string[];
  schedule: string;
  cwd: string;
  feature: string;
  enabled: boolean;
  approvalMode?: string;
  lastRunAt: string | null;
  lastStatus: number | null;
};

export function cronJobsPath(): string {
  return path.join(ensureWorkspaceState(), "cron", "jobs.json");
}

export function cronRunsRoot(): string {
  return path.join(ensureWorkspaceState(), "cron", "runs");
}

const CRON_RUN_RETENTION_DAYS = 30;

function cronRunDir(id: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeId = id.replace(/[^A-Za-z0-9_.-]/g, "_");
  const dir = path.join(cronRunsRoot(), `${stamp}-${safeId}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function pruneOldCronRuns(): void {
  const root = cronRunsRoot();
  if (!fs.existsSync(root)) return;
  const cutoff = Date.now() - CRON_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(root)) {
    const full = path.join(root, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.mtimeMs < cutoff) {
      fs.rmSync(full, { recursive: true, force: true });
    }
  }
}

function normalizeJob(job: Omit<CronJob, "lastRunAt" | "lastStatus"> & Partial<CronJob>): CronJob {
  return {
    id: job.id,
    command: job.command,
    args: job.args || [],
    schedule: job.schedule,
    cwd: ensureWithinWorkspace(path.resolve(job.cwd || workspaceRoot()), "cron.cwd"),
    feature: job.feature,
    enabled: job.enabled !== false,
    approvalMode: job.approvalMode,
    lastRunAt: job.lastRunAt ?? null,
    lastStatus: job.lastStatus ?? null,
  };
}

function saveJobs(jobs: CronJob[]): void {
  const filePath = cronJobsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJson(filePath, { jobs });
}

export function listCronJobs(): CronJob[] {
  return readJson<{ jobs: CronJob[] }>(cronJobsPath(), { jobs: [] }).jobs;
}

export function addCronJob(
  job: Omit<CronJob, "lastRunAt" | "lastStatus"> & Partial<CronJob>,
): CronJob {
  const next = normalizeJob(job);
  const jobs = listCronJobs().filter((existing) => existing.id !== next.id);
  jobs.push(next);
  saveJobs(jobs.sort((a, b) => a.id.localeCompare(b.id)));
  return next;
}

export async function runCronJob(id: string): Promise<RuntimeResult> {
  const jobs = listCronJobs();
  const idx = jobs.findIndex((job) => job.id === id);
  if (idx === -1) throw new Error(`cron job not found: ${id}`);
  const job = jobs[idx];
  if (!job.enabled) throw new Error(`cron job disabled: ${id}`);
  const risk = classifyCommandRisk({ command: job.command, args: job.args });
  if (risk.level !== "safe" && job.approvalMode !== "allow-risky") {
    throw new Error(`cron job blocked by approval policy: ${risk.reason}`);
  }

  const spec: RuntimeSpec = {
    command: job.command,
    args: job.args,
    cwd: job.cwd,
  };
  const dir = cronRunDir(id);
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const result = await runSpec(spec, DEFAULT_RUNTIME_TIMEOUT_MS);
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAtMs;

  fs.writeFileSync(path.join(dir, "stdout.log"), redactText(result.stdout));
  fs.writeFileSync(path.join(dir, "stderr.log"), redactText(result.stderr));
  writeJson(path.join(dir, "result.json"), {
    id,
    command: job.command,
    args: job.args,
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error) : null,
    startedAt,
    finishedAt,
    durationMs,
  });

  jobs[idx] = {
    ...job,
    lastRunAt: finishedAt,
    lastStatus: result.status,
  };
  saveJobs(jobs);
  appendMetricEvent({
    type: "cron",
    id,
    status: result.status,
    durationMs,
  });
  pruneOldCronRuns();
  return result;
}

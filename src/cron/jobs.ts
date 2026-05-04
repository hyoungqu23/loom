import * as path from "path";
import * as fs from "fs";
import { RuntimeResult, RuntimeSpec } from "../types";
import { ensureWorkspaceState, workspaceRoot } from "../workspace";
import { readJson, writeJson } from "../util/json";
import { runSpec } from "../engine/spawn";
import { DEFAULT_RUNTIME_TIMEOUT_MS } from "../engine/constants";
import { classifyCommandRisk } from "../engine/risk";

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

function normalizeJob(job: Omit<CronJob, "lastRunAt" | "lastStatus"> & Partial<CronJob>): CronJob {
  return {
    id: job.id,
    command: job.command,
    args: job.args || [],
    schedule: job.schedule,
    cwd: path.resolve(job.cwd || workspaceRoot()),
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
  if (risk.level === "high" && job.approvalMode !== "allow-risky") {
    throw new Error(`cron job blocked by approval policy: ${risk.reason}`);
  }

  const spec: RuntimeSpec = {
    command: job.command,
    args: job.args,
    cwd: job.cwd,
  };
  const result = await runSpec(spec, DEFAULT_RUNTIME_TIMEOUT_MS);
  jobs[idx] = {
    ...job,
    lastRunAt: new Date().toISOString(),
    lastStatus: result.status,
  };
  saveJobs(jobs);
  return result;
}

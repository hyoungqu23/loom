import * as fs from "fs";
import * as path from "path";
import { GateDecision, LoomPhase } from "../types.js";
import { ensureWorkspaceState } from "../workspace.js";

export type PhaseMetric = {
  type: "phase";
  feature: string;
  phase: LoomPhase;
  durationMs: number;
  workerCount: number;
  failedCount: number;
  gateDecision?: GateDecision;
  skills?: string[];
  at?: string;
};

export type CronMetric = {
  type: "cron";
  id: string;
  status: number | null;
  durationMs: number;
  at?: string;
};

export type MetricEvent = PhaseMetric | CronMetric;

export type SkillReviewSummary = {
  skill: string;
  failures: number;
  features: string[];
};

export type MetricsSummary = {
  feature: string;
  phases: number;
  durationMs: number;
  workers: number;
  failed: number;
};

export function metricsEventsPath(): string {
  return path.join(ensureWorkspaceState(), "metrics", "events.jsonl");
}

export function appendMetricEvent(event: MetricEvent): void {
  const filePath = metricsEventsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const withTimestamp = { ...event, at: event.at || new Date().toISOString() };
  fs.appendFileSync(filePath, `${JSON.stringify(withTimestamp)}\n`, "utf8");
}

export function loadMetricEvents(): MetricEvent[] {
  const filePath = metricsEventsPath();
  if (!fs.existsSync(filePath)) return [];
  const events: MetricEvent[] = [];
  for (const line of fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)) {
    try {
      events.push(JSON.parse(line) as MetricEvent);
    } catch {
      // Metrics are append-only operational data. Preserve access to valid
      // events even when one line is corrupted by interruption or hand edits.
    }
  }
  return events;
}

export function summarizeMetrics(): MetricsSummary[] {
  const byFeature = new Map<string, MetricsSummary>();
  for (const event of loadMetricEvents()) {
    if (event.type !== "phase") continue;
    const current =
      byFeature.get(event.feature) ??
      {
        feature: event.feature,
        phases: 0,
        durationMs: 0,
        workers: 0,
        failed: 0,
      };
    current.phases += 1;
    current.durationMs += event.durationMs;
    current.workers += event.workerCount;
    current.failed += event.failedCount;
    byFeature.set(event.feature, current);
  }
  return [...byFeature.values()].sort((a, b) =>
    a.feature.localeCompare(b.feature),
  );
}

export function summarizeSkillReview(): SkillReviewSummary[] {
  const bySkill = new Map<string, SkillReviewSummary>();
  for (const event of loadMetricEvents()) {
    if (event.type !== "phase" || event.failedCount <= 0) continue;
    for (const skill of event.skills || []) {
      const current =
        bySkill.get(skill) ?? { skill, failures: 0, features: [] };
      current.failures += event.failedCount;
      if (!current.features.includes(event.feature)) {
        current.features.push(event.feature);
      }
      bySkill.set(skill, current);
    }
  }
  return [...bySkill.values()].sort(
    (a, b) => b.failures - a.failures || a.skill.localeCompare(b.skill),
  );
}

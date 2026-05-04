import * as fs from "fs";
import * as path from "path";
import { GateDecision, LoomPhase } from "../types";
import { ensureWorkspaceState } from "../workspace";

export type MetricEvent = {
  type: "phase";
  feature: string;
  phase: LoomPhase;
  durationMs: number;
  workerCount: number;
  failedCount: number;
  gateDecision?: GateDecision;
  at?: string;
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
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MetricEvent);
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

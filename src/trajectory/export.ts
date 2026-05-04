import * as fs from "fs";
import * as path from "path";
import { loadState, resolvePhaseSession } from "../phases/session";
import { loadMetricEvents, MetricEvent } from "../metrics/events";
import { PhaseState } from "../types";
import { redactText, redactValue } from "../util/redact";

export type TrajectoryExport = {
  feature: string;
  sessionDir: string;
  state: PhaseState;
  artifacts: {
    context: string | null;
    plan: string | null;
  };
  workerOutputs: Array<{
    phase: string;
    file: string;
    body: string;
  }>;
  metrics: MetricEvent[];
};

function readOptional(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return redactText(fs.readFileSync(filePath, "utf8"));
}

function collectWorkerOutputs(sessionDir: string): TrajectoryExport["workerOutputs"] {
  const root = path.join(sessionDir, "workers");
  if (!fs.existsSync(root)) return [];
  const outputs: TrajectoryExport["workerOutputs"] = [];
  for (const phase of fs.readdirSync(root).sort()) {
    const phaseDir = path.join(root, phase);
    if (!fs.statSync(phaseDir).isDirectory()) continue;
    for (const file of fs.readdirSync(phaseDir).sort()) {
      if (!file.endsWith(".md")) continue;
      const filePath = path.join(phaseDir, file);
      outputs.push({
        phase,
        file: filePath,
        body: redactText(fs.readFileSync(filePath, "utf8")),
      });
    }
  }
  return outputs;
}

export function exportTrajectory(feature: string): TrajectoryExport {
  const sessionDir = resolvePhaseSession(feature);
  if (!sessionDir) throw new Error(`feature session not found: ${feature}`);
  const state = loadState(sessionDir);
  return redactValue({
    feature: state.feature,
    sessionDir,
    state,
    artifacts: {
      context: readOptional(path.join(sessionDir, "CONTEXT.md")),
      plan: readOptional(path.join(sessionDir, "PLAN.md")),
    },
    workerOutputs: collectWorkerOutputs(sessionDir),
    metrics: loadMetricEvents().filter(
      (event) => event.type === "phase" && event.feature === state.feature,
    ),
  });
}

import * as fs from "fs";
import * as path from "path";
import { LoomPhase, WorkerResult } from "../types";

/**
 * The detail panel surfaces *one* phase's outcome at a time. Synthesis
 * is preferred because it is already a consolidated view across personas;
 * raw worker stdout is the fallback when synthesis hasn't been produced
 * yet (e.g. `--synthesize false` runs).
 */
const SYNTHESIS_PREVIEW_BYTES = 4000;
const WORKER_HEAD_BYTES = 200;

export function readSynthesis(
  sessionDir: string,
  phase: LoomPhase,
): string | null {
  const filePath = path.join(sessionDir, "workers", phase, "synthesis.md");
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8").trim();
  return content || null;
}

export function summarizeWorkers(workers: WorkerResult[]): string {
  if (workers.length === 0) return "(no worker output)";
  return workers
    .map((worker) => {
      const head = (worker.stdout || "").trim().slice(0, WORKER_HEAD_BYTES);
      const status = worker.status === null ? "?" : worker.status;
      return `- ${worker.agentName} status=${status}\n${head || "(empty)"}`;
    })
    .join("\n\n");
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "\n…(truncated)";
}

/**
 * Build the detail-panel content for a given phase. When synthesis.md
 * is on disk it wins; otherwise we fall back to a per-worker summary
 * derived from the just-completed run.
 */
export function buildPhaseDetail(
  sessionDir: string,
  phase: LoomPhase,
  workers: WorkerResult[] = [],
): string {
  const synthesis = readSynthesis(sessionDir, phase);
  if (synthesis) {
    return `# synthesis — ${phase}\n\n${clamp(synthesis, SYNTHESIS_PREVIEW_BYTES)}`;
  }
  if (workers.length > 0) {
    return `# workers — ${phase} (synthesis missing)\n\n${summarizeWorkers(workers)}`;
  }
  return `# ${phase}\n(no synthesis or worker output yet)`;
}

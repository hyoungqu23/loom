import * as fs from "fs";
import * as path from "path";
import { LoomPhase, LOOM_PHASES } from "../types.js";
import { PREVIEW_BYTES } from "./constants.js";

/**
 * `/open` previews keep the chat detail panel readable: single-file
 * targets clamp at PREVIEW_BYTES, and the workers index only ever
 * lists files (size + name) so a session with megabytes of worker
 * output cannot blow up the UI buffer.
 */
const WORKERS_DIR = "workers";

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "\n…(truncated)";
}

function previewFile(filePath: string, header: string, missingHint: string): string {
  if (!fs.existsSync(filePath)) {
    return `# ${header}\n(missing — ${missingHint})`;
  }
  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) return `# ${header}\n(empty)`;
  return `# ${header}\n\n${clamp(content, PREVIEW_BYTES)}`;
}

export function openContext(sessionDir: string): string {
  return previewFile(
    path.join(sessionDir, "CONTEXT.md"),
    "CONTEXT.md",
    "discuss phase has not produced one yet",
  );
}

export function openPlan(sessionDir: string): string {
  return previewFile(
    path.join(sessionDir, "PLAN.md"),
    "PLAN.md",
    "plan phase has not produced one yet",
  );
}

export function openSynthesis(
  sessionDir: string,
  phase: LoomPhase,
): string {
  return previewFile(
    path.join(sessionDir, WORKERS_DIR, phase, "synthesis.md"),
    `synthesis — ${phase}`,
    `phase ${phase} has not produced synthesis yet`,
  );
}

/**
 * Build a directory listing of per-phase worker outputs. The listing
 * never loads file contents — only file names and sizes — so a session
 * with megabytes of worker stdout is still cheap to view.
 */
export function openWorkersIndex(sessionDir: string): string {
  const root = path.join(sessionDir, WORKERS_DIR);
  const lines: string[] = ["# workers index"];
  if (!fs.existsSync(root)) {
    lines.push("", "(no phases run yet)");
    return lines.join("\n");
  }
  let total = 0;
  for (const phase of LOOM_PHASES) {
    const phaseDir = path.join(root, phase);
    if (!fs.existsSync(phaseDir)) continue;
    const files = fs
      .readdirSync(phaseDir)
      .filter((file) => file.endsWith(".md"))
      .sort();
    if (files.length === 0) continue;
    lines.push("", `## ${phase}`);
    for (const file of files) {
      const stat = fs.statSync(path.join(phaseDir, file));
      lines.push(`- ${file} (${stat.size} bytes)`);
      total += 1;
    }
  }
  if (total === 0) {
    lines.push("", "(no worker output yet)");
  }
  return lines.join("\n");
}

import * as fs from "fs";
import * as path from "path";
import { ensureWorkspaceState } from "../workspace";
import {
  LoomPhase,
  LOOM_PHASES,
  PhaseHandoff,
  PhasePlan,
  PhaseState,
  SessionContext,
} from "../types";
import {
  parseContext,
  parsePlan,
  parseState,
  serializeContext,
  serializePlan,
  serializeState,
} from "./serialize";

const STATE_FILE = "STATE.md";
const CONTEXT_FILE = "CONTEXT.md";
const PLAN_FILE = "PLAN.md";
const WORKERS_DIR = "workers";

export function featuresRoot(): string {
  return path.join(ensureWorkspaceState(), "features");
}

/** Convert "Add Dark Mode" → "add-dark-mode". */
export function slugifyFeature(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureFeaturesRoot(): string {
  const dir = featuresRoot();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createPhaseSession(featureTitle: string): string {
  if (!featureTitle || !featureTitle.trim()) {
    throw new Error("feature title is required");
  }
  const slug = slugifyFeature(featureTitle);
  if (!slug) {
    throw new Error(`feature title yields empty slug: ${featureTitle}`);
  }
  const root = ensureFeaturesRoot();
  const dir = path.join(root, slug);
  if (fs.existsSync(dir)) {
    throw new Error(`feature session already exists: ${slug}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, WORKERS_DIR), { recursive: true });

  const now = nowIso();
  const state: PhaseState = {
    feature: slug,
    currentPhase: "discuss",
    history: ["discuss"],
    gates: [],
    blockers: [],
    createdAt: now,
    updatedAt: now,
  };
  writeState(dir, state);
  return dir;
}

export function loadState(sessionDir: string): PhaseState {
  const filePath = path.join(sessionDir, STATE_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error(`STATE.md missing in ${sessionDir}`);
  }
  return parseState(fs.readFileSync(filePath, "utf8"));
}

export function writeState(sessionDir: string, state: PhaseState): void {
  state.updatedAt = nowIso();
  fs.writeFileSync(
    path.join(sessionDir, STATE_FILE),
    serializeState(state),
    "utf8",
  );
}

export function loadContext(sessionDir: string): SessionContext | null {
  const filePath = path.join(sessionDir, CONTEXT_FILE);
  if (!fs.existsSync(filePath)) return null;
  return parseContext(fs.readFileSync(filePath, "utf8"));
}

export function writeContext(sessionDir: string, ctx: SessionContext): void {
  fs.writeFileSync(
    path.join(sessionDir, CONTEXT_FILE),
    serializeContext(ctx),
    "utf8",
  );
}

export function loadPlan(sessionDir: string): PhasePlan | null {
  const filePath = path.join(sessionDir, PLAN_FILE);
  if (!fs.existsSync(filePath)) return null;
  return parsePlan(fs.readFileSync(filePath, "utf8"));
}

export function writePlan(sessionDir: string, plan: PhasePlan): void {
  fs.writeFileSync(
    path.join(sessionDir, PLAN_FILE),
    serializePlan(plan),
    "utf8",
  );
}

export function appendWorkerOutput(
  sessionDir: string,
  phase: LoomPhase,
  persona: string,
  body: string,
): string {
  const phaseDir = path.join(sessionDir, WORKERS_DIR, phase);
  fs.mkdirSync(phaseDir, { recursive: true });
  const file = path.join(phaseDir, `${persona}.md`);
  const stamp = nowIso();
  const block = `\n\n<!-- run @ ${stamp} -->\n${body.trim()}\n`;
  if (fs.existsSync(file)) {
    fs.appendFileSync(file, block, "utf8");
  } else {
    fs.writeFileSync(file, `# ${persona} — ${phase}${block}`, "utf8");
  }
  return file;
}

export function listPhaseSessions(): string[] {
  const root = featuresRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .map((name) => path.join(root, name))
    .filter((entry) => fs.statSync(entry).isDirectory())
    .sort();
}

export function resolvePhaseSession(input: string): string | null {
  const all = listPhaseSessions();
  if (!input || input === "latest") {
    return all.length > 0 ? all[all.length - 1] : null;
  }
  const exact = all.find((dir) => path.basename(dir) === input);
  if (exact) return exact;
  const partial = all.find((dir) => path.basename(dir).includes(input));
  return partial || null;
}

function previousPhase(
  history: LoomPhase[],
  target: LoomPhase,
): LoomPhase | null {
  const idx = history.lastIndexOf(target);
  if (idx <= 0) return null;
  return history[idx - 1];
}

function readPriorOutputs(
  sessionDir: string,
  history: LoomPhase[],
  upTo: LoomPhase,
): { [phase: string]: string } {
  const out: { [phase: string]: string } = {};
  const stop = history.lastIndexOf(upTo);
  const slice = stop === -1 ? history : history.slice(0, stop);
  const seen = new Set<string>();
  for (const phase of slice) {
    if (seen.has(phase)) continue;
    seen.add(phase);
    const phaseDir = path.join(sessionDir, WORKERS_DIR, phase);
    if (!fs.existsSync(phaseDir)) continue;
    const parts: string[] = [];
    for (const file of fs.readdirSync(phaseDir).sort()) {
      if (!file.endsWith(".md")) continue;
      parts.push(fs.readFileSync(path.join(phaseDir, file), "utf8"));
    }
    if (parts.length > 0) out[phase] = parts.join("\n\n").trim();
  }
  return out;
}

export function buildHandoff(
  sessionDir: string,
  toPhase: LoomPhase,
): PhaseHandoff {
  if (!LOOM_PHASES.includes(toPhase)) {
    throw new Error(`buildHandoff: unknown phase ${toPhase}`);
  }
  const state = loadState(sessionDir);
  return {
    feature: state.feature,
    fromPhase: previousPhase(state.history, toPhase),
    toPhase,
    state,
    context: loadContext(sessionDir),
    plan: loadPlan(sessionDir),
    priorOutputs: readPriorOutputs(sessionDir, state.history, toPhase),
  };
}

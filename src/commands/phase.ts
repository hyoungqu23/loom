import {
  Flags,
  GateDecision,
  LoomPhase,
  LOOM_PHASES,
} from "../types";
import { flagBool, flagString } from "../util/parse-args";
import {
  createPhaseSession,
  resolvePhaseSession,
} from "../phases/session";
import { runPhase } from "../phases/runner";
import { recordPhaseGate } from "../phases/gate";

const PHASE_SET = new Set<string>(LOOM_PHASES);
const GATE_SET = new Set<GateDecision>(["proceed", "revise", "abort"]);

function isLoomPhase(value: string): value is LoomPhase {
  return PHASE_SET.has(value);
}

function isGateDecision(value: string): value is GateDecision {
  return GATE_SET.has(value as GateDecision);
}

function resolveOrCreateSession(
  feature: string,
  taskExists: boolean,
): string {
  const existing = resolvePhaseSession(feature);
  if (existing) return existing;
  if (feature === "latest") {
    throw new Error(
      "Usage: loom phase requires a feature with --feature <slug> (no sessions exist yet)",
    );
  }
  if (!taskExists) {
    throw new Error(
      `Usage: loom phase <name> "<task>" --feature <slug>  (no existing session named ${feature})`,
    );
  }
  return createPhaseSession(feature);
}

export async function runPhaseCommand(
  positionals: string[],
  flags: Flags,
): Promise<void> {
  const phaseRaw = positionals[0];
  if (!phaseRaw) {
    throw new Error(
      'Usage: loom phase <discuss|plan|build|review|verify|ship|reflect> "<task>" --feature <slug>',
    );
  }
  if (!isLoomPhase(phaseRaw)) {
    throw new Error(
      `Unknown phase: ${phaseRaw} (valid: ${LOOM_PHASES.join(", ")})`,
    );
  }
  const phase = phaseRaw;

  const task = positionals.slice(1).join(" ").trim();
  const feature = flagString(flags.feature) || "";
  const gate = flagString(flags.gate) || "";
  const note = flagString(flags.note) || undefined;

  if (!feature) {
    throw new Error(
      'Usage: loom phase <name> "<task>" --feature <slug>  (or --feature latest)',
    );
  }

  // Gate-only mode: record the user's gate decision against the
  // current phase and exit. No worker spawn.
  if (gate) {
    if (!isGateDecision(gate)) {
      throw new Error(
        `--gate must be one of: proceed, revise, abort (got: ${gate})`,
      );
    }
    const sessionDir = resolvePhaseSession(feature);
    if (!sessionDir) {
      throw new Error(`No session found for feature: ${feature}`);
    }
    recordPhaseGate(sessionDir, phase, { decision: gate, note });
    console.log(
      `[loom] gate recorded: ${phase} → ${gate}${note ? " — " + note : ""}`,
    );
    return;
  }

  if (!task) {
    throw new Error(
      'Usage: loom phase <name> "<task>" --feature <slug>  (task is required unless --gate is used)',
    );
  }

  const sessionDir = resolveOrCreateSession(feature, Boolean(task));
  const synthesizeFlag = flags.synthesize;
  const synthesize =
    synthesizeFlag === undefined ? true : flagBool(synthesizeFlag, true);
  const personas = flagString(flags.personas)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const result = await runPhase(sessionDir, phase, {
    task,
    flags,
    personas: personas.length > 0 ? personas : undefined,
    includeSecondary: flagBool(flags["include-secondary"]),
    synthesize,
  });

  console.log(
    `[loom] phase ${phase} complete (workers=${result.workers.length}, session=${sessionDir})`,
  );
}

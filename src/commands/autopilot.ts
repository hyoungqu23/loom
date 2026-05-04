import * as fs from "fs";
import * as readline from "readline";
import {
  Flags,
  GateDecision,
  LoomPhase,
  LOOM_PHASES,
  PhaseGateRecord,
} from "../types";
import { flagBool, flagString } from "../util/parse-args";
import {
  buildHandoff,
  createPhaseSession,
  loadState,
  resolvePhaseSession,
  writeState,
} from "../phases/session";
import { runPhase } from "../phases/runner";
import { inferStartPhase } from "../phases/start-phase";

const PHASE_SET = new Set<string>(LOOM_PHASES);

function isLoomPhase(value: string): value is LoomPhase {
  return PHASE_SET.has(value);
}

export type GateContext = {
  phase: LoomPhase;
  workersCount: number;
  synthesisExcerpt: string;
};

export type GateOutcome = {
  decision: GateDecision;
  note?: string;
};

export type GateProvider = (ctx: GateContext) => Promise<GateOutcome>;

export type RunAutopilotOptions = {
  /** Pluggable gate decision UI. Defaults to readline-based interactive prompt. */
  gateProvider?: GateProvider;
};

export type RunAutopilotResult = {
  sessionDir: string;
  phasesRun: LoomPhase[];
  startPhase: LoomPhase;
  endedAt: LoomPhase;
  endReason: "abort" | "end-flag" | "completed";
};

function nextPhase(current: LoomPhase): LoomPhase | null {
  const idx = LOOM_PHASES.indexOf(current);
  if (idx === -1) return null;
  if (idx === LOOM_PHASES.length - 1) return null;
  return LOOM_PHASES[idx + 1];
}

function defaultInteractiveGate(): GateProvider {
  return async (ctx) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      console.log("");
      console.log(`────────────────────────────────────────────`);
      console.log(`Phase complete: ${ctx.phase}  (workers=${ctx.workersCount})`);
      if (ctx.synthesisExcerpt) {
        console.log(`Synthesis preview:`);
        console.log(ctx.synthesisExcerpt.slice(0, 600));
      }
      const answer: string = await new Promise((resolve) => {
        rl.question(
          "Gate decision [proceed/revise/abort] (default proceed): ",
          (ans) => resolve(ans.trim()),
        );
      });
      const normalized = answer.toLowerCase();
      if (normalized === "revise" || normalized === "r") {
        return { decision: "revise" };
      }
      if (normalized === "abort" || normalized === "a") {
        return { decision: "abort" };
      }
      return { decision: "proceed" };
    } finally {
      rl.close();
    }
  };
}

function recordGate(
  sessionDir: string,
  phase: LoomPhase,
  outcome: GateOutcome,
): void {
  const state = loadState(sessionDir);
  const record: PhaseGateRecord = {
    phase,
    decision: outcome.decision,
    at: new Date().toISOString(),
  };
  if (outcome.note) record.note = outcome.note;
  state.gates.push(record);
  writeState(sessionDir, state);
}

export async function runAutopilot(
  positionals: string[],
  flags: Flags,
  opts: RunAutopilotOptions = {},
): Promise<RunAutopilotResult> {
  const task = positionals.join(" ").trim();
  if (!task) {
    throw new Error(
      'Usage: loom autopilot "<task>" --feature <slug> [--start <phase>] [--end <phase>]',
    );
  }

  const feature = flagString(flags.feature) || "";
  if (!feature) {
    throw new Error(
      'Usage: loom autopilot requires --feature <slug>  (or --feature latest)',
    );
  }

  const startFlag = flagString(flags.start) || "";
  if (startFlag && !isLoomPhase(startFlag)) {
    throw new Error(
      `--start: unknown phase ${startFlag} (valid: ${LOOM_PHASES.join(", ")})`,
    );
  }

  const endFlag = flagString(flags.end) || "";
  if (endFlag && !isLoomPhase(endFlag)) {
    throw new Error(
      `--end: unknown phase ${endFlag} (valid: ${LOOM_PHASES.join(", ")})`,
    );
  }
  const endPhase = (endFlag || "reflect") as LoomPhase;

  const synthesizeFlag = flags.synthesize;
  const synthesize =
    synthesizeFlag === undefined ? true : flagBool(synthesizeFlag, true);

  let sessionDir = resolvePhaseSession(feature);
  if (!sessionDir) {
    if (feature === "latest") {
      throw new Error(
        "loom autopilot --feature latest requires an existing session",
      );
    }
    sessionDir = createPhaseSession(feature);
  }

  // Decide start phase: explicit --start beats inference.
  let phase: LoomPhase;
  if (startFlag) {
    phase = startFlag as LoomPhase;
  } else {
    const handoff = buildHandoff(sessionDir, "discuss");
    const decision = inferStartPhase(task, handoff);
    phase = decision.phase;
    console.log(
      `[loom] autopilot start phase: ${phase} (${decision.confidence})${
        decision.note ? ` — ${decision.note}` : ""
      }`,
    );
  }

  const gate = opts.gateProvider ?? defaultInteractiveGate();
  const phasesRun: LoomPhase[] = [];
  let endReason: "abort" | "end-flag" | "completed" = "completed";

  while (true) {
    const result = await runPhase(sessionDir, phase, {
      task,
      flags,
      synthesize,
    });
    phasesRun.push(phase);

    let synthesisExcerpt = "";
    if (result.synthesisPath) {
      try {
        synthesisExcerpt = fs
          .readFileSync(result.synthesisPath, "utf8")
          .slice(0, 1200);
      } catch {
        synthesisExcerpt = "";
      }
    }

    const outcome = await gate({
      phase,
      workersCount: result.workers.length,
      synthesisExcerpt,
    });
    recordGate(sessionDir, phase, outcome);

    if (outcome.decision === "abort") {
      endReason = "abort";
      break;
    }
    if (outcome.decision === "revise") {
      // Re-run the same phase with the same task. The user is expected
      // to update CONTEXT.md / PLAN.md / etc. between invocations if
      // they want different output.
      continue;
    }
    // proceed
    if (phase === endPhase) {
      endReason = "end-flag";
      break;
    }
    const next = nextPhase(phase);
    if (!next) {
      endReason = "completed";
      break;
    }
    phase = next;
  }

  console.log(
    `[loom] autopilot done — ran ${phasesRun.length} phase(s), ended at ${phase} (${endReason})`,
  );

  return {
    sessionDir,
    phasesRun,
    startPhase: phasesRun[0],
    endedAt: phase,
    endReason,
  };
}

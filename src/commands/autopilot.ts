import * as fs from "fs";
import {
  Flags,
  GateDecision,
  LoomPhase,
  LOOM_PHASES,
} from "../types.js";
import { flagBool, flagString } from "../util/parse-args.js";
import {
  buildHandoff,
  createPhaseSession,
  resolvePhaseSession,
} from "../phases/session.js";
import { runPhase } from "../phases/runner.js";
import { recordPhaseGate } from "../phases/gate.js";
import { inferStartPhase } from "../phases/start-phase.js";
import { createGateProvider, createRenderer, type FrameDriver } from "../tui/index.js";
import { detectColorMode, detectFrameEnabled } from "../tui/isTty.js";

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

function defaultInteractiveGate(driver: FrameDriver): GateProvider {
  const ttyEnv = { isTTY: Boolean(process.stdout.isTTY), env: process.env };
  return createGateProvider({
    driver,
    colorMode: detectColorMode(ttyEnv),
    asciiOnly: !detectFrameEnabled(ttyEnv),
  });
}

function autoProceedGate(): GateProvider {
  return async () => ({ decision: "proceed" });
}

function resolveGateProvider(
  flags: Flags,
  opts: RunAutopilotOptions,
  driver: FrameDriver,
): GateProvider {
  if (opts.gateProvider) return opts.gateProvider;

  const nonInteractive =
    flagBool(flags["non-interactive"]) || flagBool(flags["no-interactive"]);
  const gatePolicy = flagString(flags.gate);
  if (gatePolicy === "auto-proceed") return autoProceedGate();
  if (nonInteractive) {
    throw new Error(
      "--non-interactive requires an explicit gate policy, e.g. --gate auto-proceed",
    );
  }
  return defaultInteractiveGate(driver);
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
  const includeSecondary = flagBool(flags["include-secondary"]);

  let sessionDir = resolvePhaseSession(feature);
  if (!sessionDir) {
    if (feature === "latest") {
      throw new Error(
        "loom autopilot --feature latest requires an existing session",
      );
    }
    sessionDir = createPhaseSession(feature);
  }

  // One renderer drives the whole autopilot run — all phases share the
  // same frame so completed phases get pinned as ✓ rows above the
  // currently active one. The renderer auto-detects TTY and falls back
  // to identical pre-TUI [loom] log lines when stdout isn't a terminal.
  const driver = createRenderer(process.stdout, { feature });

  // Decide start phase: explicit --start beats inference.
  let phase: LoomPhase;
  if (startFlag) {
    phase = startFlag as LoomPhase;
  } else {
    const handoff = buildHandoff(sessionDir, "discuss");
    const decision = inferStartPhase(task, handoff);
    phase = decision.phase;
    driver.log(
      `[loom] autopilot start phase: ${phase} (${decision.confidence})${
        decision.note ? ` — ${decision.note}` : ""
      }`,
    );
  }

  const gate = resolveGateProvider(flags, opts, driver);
  const phasesRun: LoomPhase[] = [];
  let endReason: "abort" | "end-flag" | "completed" = "completed";

  try {
    while (true) {
      const result = await runPhase(sessionDir, phase, {
        task,
        flags,
        includeSecondary,
        synthesize,
        driver,
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
      recordPhaseGate(sessionDir, phase, outcome);

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

    driver.log(
      `[loom] autopilot done — ran ${phasesRun.length} phase(s), ended at ${phase} (${endReason})`,
    );
    driver.markEnd(endReason === "abort" ? "aborted" : "completed");
  } finally {
    driver.shutdown();
  }

  return {
    sessionDir,
    phasesRun,
    startPhase: phasesRun[0],
    endedAt: phase,
    endReason,
  };
}

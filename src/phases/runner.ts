import * as fs from "fs";
import * as path from "path";
import {
  AgentRun,
  Flags,
  LoomPhase,
  LOOM_PHASES,
  PhaseHandoff,
  PhaseState,
  TeamHooks,
  WorkerResult,
} from "../types";
import { resolveAgentRun, runWorkerAsync } from "../engine/worker";
import { flagBool, flagString } from "../util/parse-args";
import { createRenderer, type FrameDriver } from "../tui";
import {
  appendWorkerOutput,
  buildHandoff,
  loadContext,
  loadPlan,
  loadState,
  writeContext,
  writePlan,
  writeState,
} from "./session";
import { loadPhaseMatrix, personasForPhase } from "./matrix";
import {
  extractContextFromOutput,
  extractMemoryCandidatesFromReflectOutput,
  extractPlanFromOutput,
  isContextDeltaEmpty,
  isPlanDeltaEmpty,
  mergeContext,
  mergePlan,
} from "./extract";
import { writeMemoryCandidates } from "../memory/store";
import { writeSkillCandidate } from "../agents/skills";
import { appendMetricEvent } from "../metrics/events";

export type PhaseRunOptions = {
  task: string;
  flags: Flags;
  hooks?: TeamHooks;
  /** Override personas; defaults to matrix.primary for the phase. */
  personas?: string[];
  /** Run synthesizer (twistedfate) over phase outputs. */
  synthesize?: boolean;
  /**
   * Caller-managed TUI driver. When provided, runPhase uses it for
   * progress events and does NOT shutdown — caller owns lifecycle.
   * When omitted, an ephemeral driver is constructed (TTY-aware) and
   * shut down before runPhase returns.
   */
  driver?: FrameDriver;
};

export type PhaseRunResult = {
  sessionDir: string;
  phase: LoomPhase;
  workers: WorkerResult[];
  synthesisPath: string | null;
  stateAfter: PhaseState;
};

const PHASE_SET = new Set<string>(LOOM_PHASES);

function ensurePhase(value: string): LoomPhase {
  if (!PHASE_SET.has(value)) {
    throw new Error(`runPhase: unknown phase ${value}`);
  }
  return value as LoomPhase;
}

function selectPersonas(phase: LoomPhase, override?: string[]): string[] {
  if (override && override.length > 0) return override;
  const matrix = loadPhaseMatrix();
  const rule = matrix.find((r) => r.phase === phase);
  // For phase runs we default to primary personas only — secondary
  // personas are advisory and can be invoked via `--personas` if
  // the user wants them.
  if (rule && rule.primary.length > 0) return rule.primary;
  // Fall back to all matrix entries for the phase (primary+secondary)
  // so a misconfigured matrix still yields someone to run.
  const fallback = personasForPhase(matrix, phase);
  if (fallback.length > 0) return fallback;
  throw new Error(`runPhase: no personas configured for phase ${phase}`);
}

function summarizeWorkersForSynthesis(
  workers: WorkerResult[],
  phase: LoomPhase,
): string {
  return workers
    .map((w) =>
      [
        `## ${w.agentName} (${phase} | ${w.agent.runtime}:${w.options.model})`,
        `status: ${w.status}`,
        "",
        "### structured_output",
        w.stdout.trim() || "(empty)",
        "",
        "### stderr_summary",
        w.stderr.trim() ? w.stderr.trim().slice(0, 1200) : "(empty)",
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

function autoExtractContext(
  sessionDir: string,
  workers: WorkerResult[],
  driver: FrameDriver,
): void {
  let ctx = loadContext(sessionDir);
  let touched = false;
  for (const w of workers) {
    const delta = extractContextFromOutput(w.stdout || "");
    if (isContextDeltaEmpty(delta)) continue;
    ctx = mergeContext(ctx, delta);
    touched = true;
  }
  if (touched && ctx) {
    writeContext(sessionDir, ctx);
    driver.log(`[loom] CONTEXT.md updated from ${workers.length} worker(s)`);
  }
}

function autoExtractPlan(
  sessionDir: string,
  workers: WorkerResult[],
  driver: FrameDriver,
): void {
  let plan = loadPlan(sessionDir);
  let touched = false;
  for (const w of workers) {
    const delta = extractPlanFromOutput(w.stdout || "");
    if (isPlanDeltaEmpty(delta)) continue;
    plan = mergePlan(plan, delta);
    touched = true;
  }
  if (touched && plan) {
    writePlan(sessionDir, plan);
    driver.log(`[loom] PLAN.md updated from ${workers.length} worker(s)`);
  }
}

function autoExtractMemoryCandidates(
  sessionDir: string,
  workers: WorkerResult[],
  driver: FrameDriver,
): void {
  const feature = path.basename(sessionDir);
  const now = new Date().toISOString();
  const candidates = workers.flatMap((w) =>
    extractMemoryCandidatesFromReflectOutput(w.stdout || "").map((candidate) => ({
      kind: candidate.kind,
      source: `reflect:${feature}:${candidate.sourceSection}`,
      confidence: "medium" as const,
      updatedAt: now,
      tags: candidate.tags,
      body: candidate.body,
    })),
  );
  const written = writeMemoryCandidates(candidates);
  if (written.length > 0) {
    driver.log(`[loom] ${written.length} memory candidate(s) written`);
  }
  const procedure = candidates.find((candidate) => candidate.kind === "procedure");
  if (procedure) {
    const skillPath = writeSkillCandidate(procedure.body, procedure.source);
    if (skillPath) driver.log(`[loom] skill candidate written: ${skillPath}`);
  }
}

function advanceState(
  sessionDir: string,
  phase: LoomPhase,
): PhaseState {
  const state = loadState(sessionDir);
  if (state.currentPhase !== phase) {
    state.currentPhase = phase;
  }
  if (state.history[state.history.length - 1] !== phase) {
    state.history.push(phase);
  }
  writeState(sessionDir, state);
  return state;
}

export async function runPhase(
  sessionDir: string,
  rawPhase: LoomPhase,
  options: PhaseRunOptions,
): Promise<PhaseRunResult> {
  const phase = ensurePhase(rawPhase);
  const personas = selectPersonas(phase, options.personas);
  const dryRun = flagBool(options.flags["dry-run"]);
  const shouldSynthesize = options.synthesize ?? !dryRun;

  // Caller-managed driver wins; otherwise build an ephemeral one based on the
  // current TTY. Ephemeral driver is shut down before we return so timers stop.
  const ownsDriver = !options.driver;
  const driver: FrameDriver =
    options.driver ??
    createRenderer(process.stdout, { feature: path.basename(sessionDir) });

  if (dryRun) {
    const handoff = buildHandoff(sessionDir, phase);
    for (const persona of personas) {
      const run: AgentRun = resolveAgentRun(
        persona,
        options.task,
        options.flags,
        { phase, handoff },
      );
      const stdinHint = run.spec.stdin ? " <prompt via stdin>" : "";
      driver.log(
        `${persona}: ${run.spec.command} ${run.spec.args.join(" ")}${stdinHint}`,
      );
    }
    if (ownsDriver) driver.shutdown();
    return {
      sessionDir,
      phase,
      workers: [],
      synthesisPath: null,
      stateAfter: loadState(sessionDir),
    };
  }

  try {
    // Build handoff BEFORE advancing state so the running phase can
    // see prior outputs as "previous" rather than "current".
    const handoff: PhaseHandoff = buildHandoff(sessionDir, phase);
    const phaseStartedAt = Date.now();

    driver.startPhase(phase, personas);

    const runs: AgentRun[] = personas.map((persona) =>
      resolveAgentRun(persona, options.task, options.flags, { phase, handoff }),
    );

    // Wrap caller hooks so worker stdout deltas feed the live frame.
    const wrappedHooks: TeamHooks = {
      ...options.hooks,
      onWorkerData: (worker, stream, text) => {
        if (stream === "stdout") {
          driver.workerProgress(worker.agentName, Buffer.byteLength(text));
        }
        options.hooks?.onWorkerData?.(worker, stream, text);
      },
    };

    // Use allSettled so a worker that throws before/after spawn (e.g. a
    // mkdir failure on a read-only mount, or a runtime that exits with an
    // unhandled error) doesn't kill the rest of the phase. Spawn-level
    // failures are already caught inside runSpec; this guards the surrounding
    // I/O. Rejected runs are surfaced to the user and excluded from synthesis.
    const settled = await Promise.allSettled(
      runs.map((run) => {
        const outputDir = path.join(
          sessionDir,
          "workers",
          phase,
          `${run.agentName}.run`,
        );
        return runWorkerAsync(run, outputDir, wrappedHooks);
      }),
    );

    const workers: WorkerResult[] = [];
    let failedCount = 0;
    for (let i = 0; i < settled.length; i += 1) {
      const outcome = settled[i];
      const run = runs[i];
      if (outcome.status === "fulfilled") {
        workers.push(outcome.value);
        continue;
      }
      failedCount += 1;
      const reason =
        outcome.reason instanceof Error
          ? outcome.reason.stack || outcome.reason.message
          : String(outcome.reason);
      driver.workerError(run.agentName, reason);
      appendWorkerOutput(
        sessionDir,
        phase,
        run.agentName,
        `(worker rejected before completion)\n\n${reason}`,
      );
    }

    let totalOutBytes = 0;
    for (const result of workers) {
      appendWorkerOutput(
        sessionDir,
        phase,
        result.agentName,
        result.stdout || "(no output)",
      );
      totalOutBytes += Buffer.byteLength(result.stdout || "");
      if (result.status !== 0) failedCount += 1;
      driver.workerDone(result.agentName, result.status, result.signal);
    }

    // Auto-extract structured artefacts from worker output. The discuss
    // phase produces CONTEXT.md; the plan phase produces PLAN.md. We merge
    // (never overwrite) so user-edited fields survive across runs.
    if (phase === "discuss") {
      autoExtractContext(sessionDir, workers, driver);
    } else if (phase === "plan") {
      autoExtractPlan(sessionDir, workers, driver);
    } else if (phase === "reflect") {
      autoExtractMemoryCandidates(sessionDir, workers, driver);
    }

    const stateAfter = advanceState(sessionDir, phase);

    let synthesisPath: string | null = null;
    if (shouldSynthesize && workers.length > 0) {
      const synthName = flagString(options.flags.synthesizer, "twistedfate");
      const synthTask = [
        `Synthesize the ${phase} phase outputs for the user.`,
        "Lead with the recommendation, list disagreements, then next-action checklist.",
        "",
        "# Original Task",
        options.task,
        "",
        "# Phase Outputs",
        summarizeWorkersForSynthesis(workers, phase),
      ].join("\n");
      const synthRun = resolveAgentRun(
        synthName,
        synthTask,
        { ...options.flags, model: undefined },
        { phase, handoff },
      );
      const synthDir = path.join(sessionDir, "workers", phase, "synthesis.run");
      const synth = await runWorkerAsync(synthRun, synthDir, options.hooks ?? {});
      synthesisPath = path.join(sessionDir, "workers", phase, "synthesis.md");
      fs.writeFileSync(synthesisPath, synth.stdout || "");
      const signalSuffix = synth.signal ? ` signal=${synth.signal}` : "";
      driver.log(`[loom] synthesis status=${synth.status}${signalSuffix}`);
    }

    driver.endPhase(phase, {
      workers: workers.length,
      outBytes: totalOutBytes,
      elapsedMs: Date.now() - phaseStartedAt,
      failed: failedCount,
    });
    appendMetricEvent({
      type: "phase",
      feature: path.basename(sessionDir),
      phase,
      durationMs: Date.now() - phaseStartedAt,
      workerCount: workers.length,
      failedCount,
      skills: [...new Set(runs.flatMap((run) => run.relevantSkills || []))],
    });

    return {
      sessionDir,
      phase,
      workers,
      synthesisPath,
      stateAfter,
    };
  } finally {
    if (ownsDriver) driver.shutdown();
  }
}

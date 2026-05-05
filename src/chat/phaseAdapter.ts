import { runPhase, PhaseRunResult } from "../phases/runner.js";
import { AgentRun, LoomPhase, WorkerResult, WorkerStream } from "../types.js";

/**
 * Chat-shaped progress event. The chat layer talks in terms of these
 * — never the raw runner hook types — so changes to runPhase's hook
 * signatures land in this file alone.
 */
export type ChatPhaseProgress =
  | { type: "worker-start"; persona: string }
  | {
      type: "worker-progress";
      persona: string;
      stream: WorkerStream;
      bytes: number;
    }
  | { type: "worker-done"; persona: string; status: number | null }
  | { type: "synthesis-start"; persona: string };

export type ChatPhaseRunOptions = {
  task: string;
  personas: string[];
  includeSecondary: boolean;
  synthesize: boolean;
  onEvent?: (event: ChatPhaseProgress) => void;
  /**
   * Minimum time (ms) between consecutive `worker-progress` events
   * for the same persona. Lifecycle events (worker-start, worker-done,
   * synthesis-start) always pass through immediately. Defaults to
   * 100ms, which is enough to keep chat redraws around 10/s/persona
   * even when an LLM CLI streams stdout in tiny chunks. Set to 0 in
   * tests to observe every chunk.
   */
  progressThrottleMs?: number;
};

const DEFAULT_PROGRESS_THROTTLE_MS = 100;

/**
 * Wrap an event emitter with per-persona throttling for the chatty
 * `worker-progress` events. Lifecycle events bypass the gate so the
 * UI still gets exact start / done / synthesis-start timing.
 *
 * Exported for unit tests; callers should normally use runChatPhase.
 */
export function createProgressEmitter(
  emit: (event: ChatPhaseProgress) => void,
  throttleMs: number,
  now: () => number = Date.now,
): (event: ChatPhaseProgress) => void {
  if (throttleMs <= 0) return emit;
  const lastByPersona = new Map<string, number>();
  return (event) => {
    if (event.type !== "worker-progress") {
      emit(event);
      return;
    }
    const t = now();
    const last = lastByPersona.get(event.persona) ?? 0;
    if (t - last < throttleMs) return;
    lastByPersona.set(event.persona, t);
    emit(event);
  };
}

/**
 * Run a single Loom phase with chat-level event semantics. Returns the
 * raw PhaseRunResult so callers that need worker output (detail panel,
 * transcript persistence) keep the existing data path; everything
 * else flows through `onEvent` as ChatPhaseProgress.
 */
export async function runChatPhase(
  sessionDir: string,
  phase: LoomPhase,
  options: ChatPhaseRunOptions,
): Promise<PhaseRunResult> {
  const rawEmit = options.onEvent;
  const throttledEmit = rawEmit
    ? createProgressEmitter(
        rawEmit,
        options.progressThrottleMs ?? DEFAULT_PROGRESS_THROTTLE_MS,
      )
    : undefined;
  return runPhase(sessionDir, phase, {
    task: options.task,
    flags: {},
    personas:
      options.personas.length > 0 ? options.personas : undefined,
    includeSecondary: options.includeSecondary,
    synthesize: options.synthesize,
    hooks: throttledEmit
      ? {
          onWorkerStart: (worker: AgentRun) =>
            throttledEmit({
              type: "worker-start",
              persona: worker.agentName,
            }),
          onWorkerData: (worker: AgentRun, stream, text) => {
            if (!text) return;
            throttledEmit({
              type: "worker-progress",
              persona: worker.agentName,
              stream,
              bytes: Buffer.byteLength(text),
            });
          },
          onWorkerDone: (result: WorkerResult) =>
            throttledEmit({
              type: "worker-done",
              persona: result.agentName,
              status: result.status,
            }),
          onSynthesisStart: (worker: AgentRun) =>
            throttledEmit({
              type: "synthesis-start",
              persona: worker.agentName,
            }),
        }
      : undefined,
  });
}

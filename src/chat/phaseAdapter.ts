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
};

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
  const onEvent = options.onEvent;
  return runPhase(sessionDir, phase, {
    task: options.task,
    flags: {},
    personas:
      options.personas.length > 0 ? options.personas : undefined,
    includeSecondary: options.includeSecondary,
    synthesize: options.synthesize,
    hooks: onEvent
      ? {
          onWorkerStart: (worker: AgentRun) =>
            onEvent({ type: "worker-start", persona: worker.agentName }),
          onWorkerData: (worker: AgentRun, stream, text) => {
            if (!text) return;
            onEvent({
              type: "worker-progress",
              persona: worker.agentName,
              stream,
              bytes: Buffer.byteLength(text),
            });
          },
          onWorkerDone: (result: WorkerResult) =>
            onEvent({
              type: "worker-done",
              persona: result.agentName,
              status: result.status,
            }),
          onSynthesisStart: (worker: AgentRun) =>
            onEvent({
              type: "synthesis-start",
              persona: worker.agentName,
            }),
        }
      : undefined,
  });
}

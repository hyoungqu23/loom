import { ChatCommand } from "./commands";
import { ChatState, chatReducer, renderChatStatus } from "./state";
import { runPhase, PhaseRunResult } from "../phases/runner";
import { recordPhaseGate } from "../phases/gate";
import { AgentRun, WorkerResult } from "../types";

export type ChatRuntimeMessage =
  | { type: "run-start"; text: string }
  | { type: "run-finish"; text: string }
  | { type: "worker-start"; text: string }
  | { type: "worker-progress"; text: string }
  | { type: "worker-done"; text: string }
  | { type: "synthesis-start"; text: string }
  | { type: "gate-recorded"; text: string }
  | { type: "gate-wait"; text: string }
  | { type: "option"; text: string }
  | { type: "status"; text: string }
  | { type: "error"; text: string };

export type ChatCommandExecution = {
  state: ChatState;
  messages: ChatRuntimeMessage[];
  phaseResult?: PhaseRunResult;
};

export type ChatRuntimeOptions = {
  onMessage?: (message: ChatRuntimeMessage) => void;
};

function emitProgress(
  opts: ChatRuntimeOptions,
  message: ChatRuntimeMessage,
): void {
  opts.onMessage?.(message);
}

export async function executeChatCommand(
  state: ChatState,
  command: ChatCommand,
  opts: ChatRuntimeOptions = {},
): Promise<ChatCommandExecution> {
  if (command.type === "phase") {
    const startMessage: ChatRuntimeMessage = {
      type: "run-start",
      text: `phase started: ${command.phase}`,
    };
    emitProgress(opts, startMessage);
    const runningState = chatReducer(state, {
      type: "run-start",
      phase: command.phase,
    });
    const phaseResult = await runPhase(state.sessionDir, command.phase, {
      task: command.task,
      flags: {},
      personas:
        state.options.personas.length > 0 ? state.options.personas : undefined,
      includeSecondary: state.options.includeSecondary,
      synthesize: state.options.synthesize,
      hooks: {
        onWorkerStart: (worker: AgentRun) => {
          emitProgress(opts, {
            type: "worker-start",
            text: `worker started: ${worker.agentName}`,
          });
        },
        onWorkerData: (worker: AgentRun, stream, text) => {
          if (!text) return;
          emitProgress(opts, {
            type: "worker-progress",
            text: `worker ${worker.agentName} ${stream} +${Buffer.byteLength(text)} bytes`,
          });
        },
        onWorkerDone: (result: WorkerResult) => {
          emitProgress(opts, {
            type: "worker-done",
            text: `worker finished: ${result.agentName} status=${result.status}`,
          });
        },
        onSynthesisStart: (worker: AgentRun) => {
          emitProgress(opts, {
            type: "synthesis-start",
            text: `synthesis started: ${worker.agentName}`,
          });
        },
      },
    });
    const finishMessage: ChatRuntimeMessage = {
      type: "run-finish",
      text: `phase finished: ${command.phase} workers=${phaseResult.workers.length}`,
    };
    emitProgress(opts, finishMessage);
    return {
      state: chatReducer(runningState, {
        type: "run-finish",
        phase: phaseResult.stateAfter.currentPhase,
      }),
      messages: [startMessage, finishMessage],
      phaseResult,
    };
  }

  if (command.type === "gate") {
    const record = recordPhaseGate(state.sessionDir, state.currentPhase, {
      decision: command.decision,
      note: command.note || undefined,
    });
    const suffix = record.note ? ` - ${record.note}` : "";
    return {
      state,
      messages: [
        {
          type: "gate-recorded",
          text: `gate recorded: ${record.phase} -> ${record.decision}${suffix}`,
        },
      ],
    };
  }

  if (command.type === "secondary") {
    return {
      state: chatReducer(state, {
        type: "set-secondary",
        enabled: command.enabled,
      }),
      messages: [
        { type: "option", text: `secondary ${command.enabled ? "on" : "off"}` },
      ],
    };
  }

  if (command.type === "synthesize") {
    return {
      state: chatReducer(state, {
        type: "set-synthesize",
        enabled: command.enabled,
      }),
      messages: [
        {
          type: "option",
          text: `synthesize ${command.enabled ? "on" : "off"}`,
        },
      ],
    };
  }

  if (command.type === "personas") {
    return {
      state: chatReducer(state, {
        type: "set-personas",
        personas: command.personas,
      }),
      messages: [
        {
          type: "option",
          text: `personas set: ${command.personas.join(", ") || "(default)"}`,
        },
      ],
    };
  }

  if (command.type === "status") {
    return {
      state,
      messages: [{ type: "status", text: renderChatStatus(state) }],
    };
  }

  return {
    state,
    messages: [{ type: "error", text: `unsupported command: ${command.type}` }],
  };
}

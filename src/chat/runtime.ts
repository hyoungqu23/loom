import { ChatCommand } from "./commands.js";
import { ChatState, chatReducer, renderChatStatus } from "./state.js";
import { runPhase, PhaseRunResult } from "../phases/runner.js";
import { recordPhaseGate } from "../phases/gate.js";
import { AgentRun, GateDecision, LoomPhase, WorkerResult } from "../types.js";
import {
  DEFAULT_AUTOPILOT_END_PHASE,
  isAutopilotEnd,
  nextLoomPhase,
} from "./autopilot.js";
import {
  openContext,
  openPlan,
  openSynthesis,
  openWorkersIndex,
} from "./files.js";

export type ChatRuntimeMessage =
  | { type: "run-start"; text: string }
  | { type: "run-finish"; text: string }
  | { type: "worker-start"; text: string }
  | { type: "worker-progress"; text: string }
  | { type: "worker-done"; text: string }
  | { type: "synthesis-start"; text: string }
  | { type: "gate-recorded"; text: string }
  | { type: "gate-wait"; text: string }
  | { type: "autopilot-start"; text: string }
  | { type: "autopilot-stop"; text: string }
  | { type: "option"; text: string }
  | { type: "status"; text: string }
  | { type: "open"; text: string }
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

/**
 * Run a single Loom phase from chat and return progress messages plus
 * the resulting `ChatState`. Does not mutate gate state. Used by both
 * `/phase` (single-shot) and `/autopilot` (loop) entry points so the
 * worker hook surface stays in one place.
 *
 * The returned state is `idle` so callers can decide whether to leave
 * the user at the input line (single-phase) or move into a
 * waiting-for-gate state (autopilot).
 */
async function runChatPhase(
  state: ChatState,
  phase: LoomPhase,
  task: string,
  opts: ChatRuntimeOptions,
): Promise<{
  state: ChatState;
  messages: ChatRuntimeMessage[];
  phaseResult: PhaseRunResult;
}> {
  const startMessage: ChatRuntimeMessage = {
    type: "run-start",
    text: `phase started: ${phase}`,
  };
  emitProgress(opts, startMessage);
  const runningState = chatReducer(state, { type: "run-start", phase });
  const phaseResult = await runPhase(state.sessionDir, phase, {
    task,
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
    text: `phase finished: ${phase} workers=${phaseResult.workers.length}`,
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

function gateWaitMessage(phase: LoomPhase): ChatRuntimeMessage {
  return {
    type: "gate-wait",
    text: `awaiting /gate proceed|revise|abort for phase ${phase}`,
  };
}

async function startAutopilot(
  state: ChatState,
  task: string,
  opts: ChatRuntimeOptions,
): Promise<ChatCommandExecution> {
  const endPhase = DEFAULT_AUTOPILOT_END_PHASE;
  const startMsg: ChatRuntimeMessage = {
    type: "autopilot-start",
    text: `autopilot started: ${state.currentPhase} → ${endPhase}`,
  };
  emitProgress(opts, startMsg);
  const armedState = chatReducer(state, {
    type: "autopilot-start",
    task,
    endPhase,
  });
  const phaseRun = await runChatPhase(armedState, state.currentPhase, task, opts);
  const waitState = chatReducer(phaseRun.state, {
    type: "gate-wait",
    phase: phaseRun.phaseResult.stateAfter.currentPhase,
  });
  const waitMsg = gateWaitMessage(phaseRun.phaseResult.stateAfter.currentPhase);
  emitProgress(opts, waitMsg);
  return {
    state: waitState,
    messages: [startMsg, ...phaseRun.messages, waitMsg],
    phaseResult: phaseRun.phaseResult,
  };
}

async function advanceAutopilotAfterProceed(
  state: ChatState,
  finishedPhase: LoomPhase,
  opts: ChatRuntimeOptions,
): Promise<ChatCommandExecution> {
  const autopilot = state.autopilot;
  if (!autopilot) {
    return { state, messages: [] };
  }
  if (isAutopilotEnd(finishedPhase, autopilot.endPhase)) {
    const stoppedState = chatReducer(state, { type: "autopilot-stop" });
    const stopMsg: ChatRuntimeMessage = {
      type: "autopilot-stop",
      text: `autopilot complete: stopped at ${finishedPhase}`,
    };
    emitProgress(opts, stopMsg);
    return { state: stoppedState, messages: [stopMsg] };
  }
  const next = nextLoomPhase(finishedPhase);
  if (!next) {
    const stoppedState = chatReducer(state, { type: "autopilot-stop" });
    const stopMsg: ChatRuntimeMessage = {
      type: "autopilot-stop",
      text: `autopilot complete: no phase after ${finishedPhase}`,
    };
    emitProgress(opts, stopMsg);
    return { state: stoppedState, messages: [stopMsg] };
  }
  const phaseRun = await runChatPhase(state, next, autopilot.task, opts);
  const waitState = chatReducer(phaseRun.state, {
    type: "gate-wait",
    phase: phaseRun.phaseResult.stateAfter.currentPhase,
  });
  const waitMsg = gateWaitMessage(phaseRun.phaseResult.stateAfter.currentPhase);
  emitProgress(opts, waitMsg);
  return {
    state: waitState,
    messages: [...phaseRun.messages, waitMsg],
    phaseResult: phaseRun.phaseResult,
  };
}

async function rerunAutopilotPhase(
  state: ChatState,
  phase: LoomPhase,
  opts: ChatRuntimeOptions,
): Promise<ChatCommandExecution> {
  const autopilot = state.autopilot;
  if (!autopilot) return { state, messages: [] };
  const phaseRun = await runChatPhase(state, phase, autopilot.task, opts);
  const waitState = chatReducer(phaseRun.state, {
    type: "gate-wait",
    phase: phaseRun.phaseResult.stateAfter.currentPhase,
  });
  const waitMsg = gateWaitMessage(phaseRun.phaseResult.stateAfter.currentPhase);
  emitProgress(opts, waitMsg);
  return {
    state: waitState,
    messages: [...phaseRun.messages, waitMsg],
    phaseResult: phaseRun.phaseResult,
  };
}

async function handleGateInAutopilot(
  state: ChatState,
  decision: GateDecision,
  gatePhase: LoomPhase,
  recordedMessage: ChatRuntimeMessage,
  opts: ChatRuntimeOptions,
): Promise<ChatCommandExecution> {
  if (decision === "abort") {
    const stoppedState = chatReducer(state, { type: "autopilot-stop" });
    const stopMsg: ChatRuntimeMessage = {
      type: "autopilot-stop",
      text: "autopilot aborted",
    };
    emitProgress(opts, stopMsg);
    return { state: stoppedState, messages: [recordedMessage, stopMsg] };
  }
  if (decision === "revise") {
    const followup = await rerunAutopilotPhase(state, gatePhase, opts);
    return {
      state: followup.state,
      messages: [recordedMessage, ...followup.messages],
      phaseResult: followup.phaseResult,
    };
  }
  // proceed
  const followup = await advanceAutopilotAfterProceed(state, gatePhase, opts);
  return {
    state: followup.state,
    messages: [recordedMessage, ...followup.messages],
    phaseResult: followup.phaseResult,
  };
}

export async function executeChatCommand(
  state: ChatState,
  command: ChatCommand,
  opts: ChatRuntimeOptions = {},
): Promise<ChatCommandExecution> {
  if (command.type === "phase") {
    const phaseRun = await runChatPhase(
      state,
      command.phase,
      command.task,
      opts,
    );
    return {
      state: phaseRun.state,
      messages: phaseRun.messages,
      phaseResult: phaseRun.phaseResult,
    };
  }

  if (command.type === "autopilot") {
    if (state.autopilot) {
      return {
        state,
        messages: [
          {
            type: "error",
            text: "autopilot already running; /gate abort to stop first",
          },
        ],
      };
    }
    return startAutopilot(state, command.task, opts);
  }

  if (command.type === "gate") {
    const gatePhase =
      state.run.status === "waiting-for-gate"
        ? state.run.phase
        : state.currentPhase;
    const record = recordPhaseGate(state.sessionDir, gatePhase, {
      decision: command.decision,
      note: command.note || undefined,
    });
    const suffix = record.note ? ` - ${record.note}` : "";
    const recordedMessage: ChatRuntimeMessage = {
      type: "gate-recorded",
      text: `gate recorded: ${record.phase} -> ${record.decision}${suffix}`,
    };
    if (state.autopilot) {
      return handleGateInAutopilot(
        state,
        command.decision,
        gatePhase,
        recordedMessage,
        opts,
      );
    }
    return { state, messages: [recordedMessage] };
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

  if (command.type === "open") {
    let detail: string;
    if (command.target === "context") {
      detail = openContext(state.sessionDir);
    } else if (command.target === "plan") {
      detail = openPlan(state.sessionDir);
    } else if (command.target === "synthesis") {
      detail = openSynthesis(state.sessionDir, state.currentPhase);
    } else {
      detail = openWorkersIndex(state.sessionDir);
    }
    return {
      state: chatReducer(state, { type: "set-detail", detail }),
      messages: [{ type: "open", text: `opened ${command.target}` }],
    };
  }

  return {
    state,
    messages: [{ type: "error", text: `unsupported command: ${command.type}` }],
  };
}

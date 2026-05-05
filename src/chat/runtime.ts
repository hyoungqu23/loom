import { readChatArtifactFlags } from "./artifacts.js";
import { ChatCommand } from "./commands.js";
import { ChatState, chatReducer, renderChatStatus } from "./state.js";
import { PhaseRunResult } from "../phases/runner.js";
import { recordPhaseGate } from "../phases/gate.js";
import { loadState } from "../phases/session.js";
import { GateDecision, LoomPhase, LOOM_PHASES } from "../types.js";
import {
  DEFAULT_AUTOPILOT_END_PHASE,
  inferAutopilotStartPhase,
  isAutopilotEnd,
  nextLoomPhase,
} from "./autopilot.js";
import {
  openContext,
  openPlan,
  openSynthesis,
  openWorkersIndex,
} from "./files.js";
import { ChatPhaseProgress, runChatPhase } from "./phaseAdapter.js";

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
  | { type: "refresh"; text: string }
  | { type: "open"; text: string }
  | { type: "help"; text: string }
  | { type: "quit"; text: string }
  | { type: "error"; text: string };

export type ChatCommandExecution = {
  state: ChatState;
  messages: ChatRuntimeMessage[];
  phaseResult?: PhaseRunResult;
  /**
   * Explicit detail-panel update produced by the command (currently
   * only `/open <target>`). When unset the controller falls back to
   * deriving detail from `phaseResult` (synthesis-first) or carries
   * the previous detail forward unchanged.
   */
  detail?: string;
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

function chatHelpText(): string {
  return [
    "slash commands:",
    "  /phase <name> [task]            run a single phase",
    "  /autopilot <task>               loop phases, pause for /gate after each",
    "  /gate proceed|revise|abort [n]  record a gate decision",
    "  /personas a,b                   override personas for future runs",
    "  /secondary on|off               include matrix secondary personas",
    "  /synthesize on|off              toggle the twistedfate synthesis pass",
    "  /open context|plan|workers|synthesis",
    "                                  preview an artefact in the detail panel",
    "  /status                         print current chat / session snapshot",
    "  /refresh                        re-read STATE.md / CONTEXT.md / PLAN.md",
    "  /help                           this list",
    "  /quit                           exit the chat session",
  ].join("\n");
}

function progressToMessage(event: ChatPhaseProgress): ChatRuntimeMessage {
  switch (event.type) {
    case "worker-start":
      return { type: "worker-start", text: `worker started: ${event.persona}` };
    case "worker-progress":
      return {
        type: "worker-progress",
        text: `worker ${event.persona} ${event.stream} +${event.bytes} bytes`,
      };
    case "worker-done":
      return {
        type: "worker-done",
        text: `worker finished: ${event.persona} status=${event.status}`,
      };
    case "synthesis-start":
      return {
        type: "synthesis-start",
        text: `synthesis started: ${event.persona}`,
      };
  }
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
async function executeChatPhase(
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
  const phaseResult = await runChatPhase(state.sessionDir, phase, {
    task,
    personas: state.options.personas,
    includeSecondary: state.options.includeSecondary,
    synthesize: state.options.synthesize,
    onEvent: (event) => emitProgress(opts, progressToMessage(event)),
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
  startPhaseOverride?: LoomPhase,
  endPhaseOverride?: LoomPhase,
): Promise<ChatCommandExecution> {
  // Resolve start phase: explicit /autopilot --start beats inference,
  // inference (with state-guards) beats currentPhase. Fall back to
  // currentPhase if inferStartPhase yields a low-confidence default
  // that doesn't move us forward.
  const startPhase =
    startPhaseOverride ?? inferAutopilotStartPhase(state, task);
  const endPhase = endPhaseOverride ?? DEFAULT_AUTOPILOT_END_PHASE;
  // Guard: end phase must come at or after the start phase in
  // LOOM_PHASES order. Without this an /autopilot --end <earlier>
  // call (or an inferred startPhase past an explicit --end) would
  // satisfy isAutopilotEnd only by accident — never on the resolved
  // start phase, since nextLoomPhase always moves forward — and the
  // loop would silently run all the way to reflect.
  const startIdx = LOOM_PHASES.indexOf(startPhase);
  const endIdx = LOOM_PHASES.indexOf(endPhase);
  if (endIdx < startIdx) {
    return {
      state,
      messages: [
        {
          type: "error",
          text: `autopilot end phase ${endPhase} comes before start phase ${startPhase}; pick --end ${startPhase} or later`,
        },
      ],
    };
  }
  const startMsg: ChatRuntimeMessage = {
    type: "autopilot-start",
    text: `autopilot started: ${startPhase} → ${endPhase}`,
  };
  emitProgress(opts, startMsg);
  const armedState = chatReducer(state, {
    type: "autopilot-start",
    task,
    endPhase,
  });
  const phaseRun = await executeChatPhase(armedState, startPhase, task, opts);
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
  const phaseRun = await executeChatPhase(state, next, autopilot.task, opts);
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
  const phaseRun = await executeChatPhase(state, phase, autopilot.task, opts);
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
    // Refuse direct /phase calls while autopilot is in flight: the
    // loop tracks currentPhase to compute the next step on /gate
    // proceed, and an out-of-band phase jump silently breaks that
    // sequence. Users must /gate abort first if they want manual
    // control.
    if (state.autopilot) {
      return {
        state,
        messages: [
          {
            type: "error",
            text: "autopilot is running; /gate abort to stop it before running /phase",
          },
        ],
      };
    }
    const phaseRun = await executeChatPhase(
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
    return startAutopilot(
      state,
      command.task,
      opts,
      command.startPhase,
      command.endPhase,
    );
  }

  if (command.type === "gate") {
    // Priority: explicit `/gate <decision> <phase>` arg → the phase
    // the autopilot loop is parked on → the most recently completed
    // phase (currentPhase). This mirrors `loom phase --gate <phase>`
    // on the CLI side: chat callers can override the inference when
    // the recorded phase matters (audit log, retroactive notes).
    const gatePhase =
      command.phase ??
      (state.run.status === "waiting-for-gate"
        ? state.run.phase
        : state.currentPhase);
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
    const text =
      command.personas.length === 0
        ? "personas reset; future runs will use the phase matrix defaults"
        : `personas set: ${command.personas.join(", ")}`;
    return {
      state: chatReducer(state, {
        type: "set-personas",
        personas: command.personas,
      }),
      messages: [{ type: "option", text }],
    };
  }

  if (command.type === "status") {
    return {
      state,
      messages: [{ type: "status", text: renderChatStatus(state) }],
    };
  }

  if (command.type === "refresh") {
    const persisted = loadState(state.sessionDir);
    const artifacts = readChatArtifactFlags(state.sessionDir);
    const refreshed = chatReducer(state, {
      type: "refresh",
      currentPhase: persisted.currentPhase,
      hasContext: artifacts.hasContext,
      hasPlan: artifacts.hasPlan,
    });
    return {
      state: refreshed,
      messages: [
        {
          type: "refresh",
          text: `refreshed: phase=${persisted.currentPhase} context=${
            artifacts.hasContext ? "yes" : "no"
          } plan=${artifacts.hasPlan ? "yes" : "no"}`,
        },
      ],
    };
  }

  if (command.type === "help") {
    return {
      state,
      messages: [{ type: "help", text: chatHelpText() }],
    };
  }

  if (command.type === "quit") {
    return {
      state,
      messages: [{ type: "quit", text: "exit requested via /quit" }],
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
      state,
      messages: [{ type: "open", text: `opened ${command.target}` }],
      detail,
    };
  }

  // Exhaustiveness check — every ChatCommand branch returns above. If
  // a new command is added without a runtime branch, TypeScript flags
  // this assignment instead of letting an "unsupported" message slip
  // through silently at runtime.
  const _exhaustive: never = command;
  throw new Error(`unreachable chat command: ${JSON.stringify(_exhaustive)}`);
}

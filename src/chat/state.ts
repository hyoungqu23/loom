import type { LoomPhase } from "../types.js";

/**
 * State carried across iterations of a `/autopilot` chat session.
 *
 * `task` is the prompt the user originally typed; it is reused on every
 * phase iteration including `revise` reruns. `endPhase` is the last
 * phase the loop will run before stopping after a `proceed` gate
 * (defaults to "reflect" so the full workflow is covered).
 */
export type AutopilotContext = {
  task: string;
  endPhase: LoomPhase;
};

export type ChatState = {
  sessionDir: string;
  feature: string;
  currentPhase: LoomPhase;
  hasContext: boolean;
  hasPlan: boolean;
  options: {
    personas: string[];
    includeSecondary: boolean;
    synthesize: boolean;
  };
  run: { status: "idle" } | { status: "running"; phase: LoomPhase } | {
    status: "waiting-for-gate";
    phase: LoomPhase;
  };
  autopilot: AutopilotContext | null;
};

export type CreateInitialChatStateInput = {
  sessionDir: string;
  feature: string;
  currentPhase: LoomPhase;
  hasContext?: boolean;
  hasPlan?: boolean;
};

export type ChatAction =
  | { type: "set-secondary"; enabled: boolean }
  | { type: "set-synthesize"; enabled: boolean }
  | { type: "set-personas"; personas: string[] }
  | { type: "run-start"; phase: LoomPhase }
  | { type: "gate-wait"; phase: LoomPhase }
  | { type: "run-finish"; phase: LoomPhase }
  | { type: "autopilot-start"; task: string; endPhase: LoomPhase }
  | { type: "autopilot-stop" }
  | {
      type: "refresh";
      currentPhase: LoomPhase;
      hasContext: boolean;
      hasPlan: boolean;
    };

export function createInitialChatState(
  input: CreateInitialChatStateInput,
): ChatState {
  return {
    sessionDir: input.sessionDir,
    feature: input.feature,
    currentPhase: input.currentPhase,
    hasContext: Boolean(input.hasContext),
    hasPlan: Boolean(input.hasPlan),
    options: {
      personas: [],
      includeSecondary: false,
      synthesize: true,
    },
    run: { status: "idle" },
    autopilot: null,
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "set-secondary":
      return {
        ...state,
        options: { ...state.options, includeSecondary: action.enabled },
      };
    case "set-synthesize":
      return {
        ...state,
        options: { ...state.options, synthesize: action.enabled },
      };
    case "set-personas":
      return {
        ...state,
        options: { ...state.options, personas: action.personas },
      };
    case "run-start":
      return { ...state, run: { status: "running", phase: action.phase } };
    case "gate-wait":
      return {
        ...state,
        run: { status: "waiting-for-gate", phase: action.phase },
      };
    case "run-finish":
      return {
        ...state,
        currentPhase: action.phase,
        run: { status: "idle" },
      };
    case "autopilot-start":
      return {
        ...state,
        autopilot: { task: action.task, endPhase: action.endPhase },
      };
    case "autopilot-stop":
      return { ...state, run: { status: "idle" }, autopilot: null };
    case "refresh":
      return {
        ...state,
        currentPhase: action.currentPhase,
        hasContext: action.hasContext,
        hasPlan: action.hasPlan,
      };
  }
}

export function renderChatStatus(state: ChatState): string {
  return [
    `feature=${state.feature}`,
    `phase=${state.currentPhase}`,
    `context=${state.hasContext ? "yes" : "no"}`,
    `plan=${state.hasPlan ? "yes" : "no"}`,
    `secondary=${state.options.includeSecondary ? "on" : "off"}`,
    `synthesize=${state.options.synthesize ? "on" : "off"}`,
    `run=${state.run.status}`,
    `autopilot=${state.autopilot ? "on" : "off"}`,
  ].join(" ");
}

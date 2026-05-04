export {
  serializeState,
  parseState,
  serializeContext,
  parseContext,
  serializePlan,
  parsePlan,
} from "./serialize";

export {
  runPhase,
  type PhaseRunOptions,
  type PhaseRunResult,
} from "./runner";

export {
  parseStartPhaseRules,
  loadStartPhaseRules,
  inferStartPhase,
  BUILTIN_START_PHASE_RULES,
  type StartPhaseRule,
  type StartPhaseDecision,
} from "./start-phase";

export {
  parsePhaseMatrix,
  loadPhaseMatrix,
  personasForPhase,
  primaryPersonaForPhase,
  BUILTIN_PHASE_MATRIX,
  type PhaseMatrixRule,
} from "./matrix";

export {
  featuresRoot,
  slugifyFeature,
  createPhaseSession,
  loadState,
  writeState,
  loadContext,
  writeContext,
  loadPlan,
  writePlan,
  appendWorkerOutput,
  listPhaseSessions,
  resolvePhaseSession,
  buildHandoff,
} from "./session";

export type RuntimeName = string;

export type RuntimeConfig = {
  command: string;
  model: string;
  effort?: string;
  sandbox?: string;
  permissionMode?: string;
  approvalMode?: string;
  outputFormat?: string;
  extraArgs?: string[];
};

export type AgentConfig = {
  description: string;
  runtime: RuntimeName;
  model: string;
  effort?: string;
  rolePrompt?: string;
  contract?: string;
};

export type OrchestratorConfig = {
  name: string;
  runtime: RuntimeName;
  model: string;
  effort?: string;
};

export type Defaults = {
  orchestrator: OrchestratorConfig;
  outputContract: { [key: string]: string };
  runtimes: { [key: string]: RuntimeConfig };
  agents: { [key: string]: AgentConfig };
  /**
   * Preferred response language for agent personas.
   * "auto" lets the model mirror the user's language. Any IETF-style
   * tag like "ko" or "en" forces a specific language via the common
   * system prompt's `${language}` placeholder.
   */
  language?: string;
};

/**
 * CLI flags as they flow through the program.
 * `parseArgs` only ever yields `string | boolean`, but callers may pass
 * pre-coerced numbers when invoking commands programmatically.
 */
export type FlagValue = string | boolean | number;
export type Flags = { [key: string]: FlagValue | undefined };

export type ParsedArgs = {
  positionals: string[];
  flags: Flags;
};

export type RuntimeSpec = {
  command: string;
  args: string[];
  cwd: string;
  stdin?: string;
  /**
   * When set, the child process will receive only these env vars (plus
   * the host PATH so the binary itself resolves). When omitted, the
   * spawn falls back to `process.env` for backwards compatibility with
   * direct callers (e.g. cron jobs).
   */
  env?: NodeJS.ProcessEnv;
};

export type RunOptions = {
  cwd?: string;
  model?: string;
  effort?: string;
  agent?: string;
  sandbox?: string;
  permissionMode?: string;
  approvalMode?: string;
  outputFormat?: string;
  timeoutMs?: number;
  /**
   * `"allowlist"` (default) restricts child env to runtime-specific keys
   * plus a shared system list. `"full"` passes the entire host env
   * through — useful for debugging missing-key issues.
   */
  envPassthrough?: "allowlist" | "full";
};

export type AgentRun = {
  agentName: string;
  agent: AgentConfig;
  prompt: string;
  relevantSkills?: string[];
  options: RunOptions;
  spec: RuntimeSpec;
};

export type WorkerStream = "stdout" | "stderr";

export type TeamHooks = {
  onTeamStart?: (info: {
    dir: string;
    task: string;
    agentNames: string[];
    workers: AgentRun[];
  }) => void;
  onWorkerStart?: (worker: AgentRun, outputDir: string) => void;
  onWorkerData?: (worker: AgentRun, stream: WorkerStream, text: string) => void;
  onWorkerDone?: (result: WorkerResult) => void;
  onSynthesisStart?: (worker: AgentRun, outputDir: string) => void;
};

export type WorkerResult = AgentRun & {
  outputDir: string;
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
};

export type RuntimeResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error: Error | null;
};

export type SessionSummary = {
  name: string;
  dir: string;
  kind: string;
  agents: string;
  status: string;
  task: string;
};

export type SkillMetadata = {
  name: string;
  path: string;
  description: string;
  whenToUse?: string;
};

export type InstalledSkill = {
  name: string;
  path: string;
};

export type CommandCheck = {
  ok: boolean;
  path: string;
  stderr: string;
};

export type RuntimeVersionInfo = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type TeamRunResult = {
  dir: string;
  results: WorkerResult[];
};

export type WorkspaceContext = {
  /** Absolute path to the active workspace root. */
  root: string;
  /** Absolute path to package root (where defaults.json lives). */
  packageRoot: string;
};

export type LogSink = {
  log: (...args: string[]) => void;
  error: (...args: string[]) => void;
};

/**
 * Loom 7-phase workflow.
 *
 * Inspired by GSD (discuss/plan/execute/verify/ship), Superpowers
 * (brainstorming → review → finishing), and gstack (think/plan/build/
 * review/test/ship/reflect). Loom keeps `review` and `reflect` as
 * separate phases so persona boundaries stay clean.
 */
export type LoomPhase =
  | "discuss"
  | "plan"
  | "build"
  | "review"
  | "verify"
  | "ship"
  | "reflect";

export const LOOM_PHASES: LoomPhase[] = [
  "discuss",
  "plan",
  "build",
  "review",
  "verify",
  "ship",
  "reflect",
];

/**
 * Result of a single phase gate decision in `loom autopilot`.
 *
 * `proceed` = user approved moving to the next phase.
 * `revise`  = stay in current phase, re-run with feedback.
 * `abort`   = stop the autopilot loop.
 */
export type GateDecision = "proceed" | "revise" | "abort";

export type PhaseGateRecord = {
  phase: LoomPhase;
  decision: GateDecision;
  /** ISO 8601 timestamp. */
  at: string;
  /** Optional user-supplied note attached to the decision. */
  note?: string;
};

/**
 * Persistent session state across phases. Serialised to STATE.md
 * (YAML frontmatter + markdown body) at the session root.
 */
export type PhaseState = {
  /** Slug used for the session directory (e.g. "add-dark-mode"). */
  feature: string;
  /** Phase the session is currently in. */
  currentPhase: LoomPhase;
  /** Phases that have been entered (in order). */
  history: LoomPhase[];
  /** Manual gate decisions for autopilot mode. */
  gates: PhaseGateRecord[];
  /** Open blockers preventing forward progress. */
  blockers: string[];
  /** Timestamp the session was created (ISO 8601). */
  createdAt: string;
  /** Timestamp of the last write to STATE.md (ISO 8601). */
  updatedAt: string;
};

/**
 * Domain dictionary + intent captured during the `discuss` phase.
 * Inspired by Matt Pocock's domain-model skill.
 */
export type SessionContext = {
  /** One-paragraph problem statement. */
  problem: string;
  /** Target user / stakeholder. */
  user: string;
  /** Domain terms with shared definitions. */
  glossary: Array<{ term: string; definition: string }>;
  /** Decisions locked by the user during discussion. */
  decisions: string[];
  /** Things explicitly out of scope. */
  nonGoals: string[];
  /** Open questions still needing clarification. */
  openQuestions: string[];
};

/**
 * Plan artefact produced by the `plan` phase. Maps acceptance
 * criteria to modules and test cases.
 */
export type PhasePlan = {
  /** Brief technical approach. */
  approach: string;
  /** Modules / files expected to change. */
  modules: string[];
  /** Acceptance criteria (Given/When/Then or checklist). */
  acceptanceCriteria: string[];
  /** Test plan: each entry maps to one or more AC. */
  testPlan: Array<{ name: string; covers: string[] }>;
  /** Risks or rollback notes. */
  risks: string[];
};

/**
 * Hand-off bundle passed from one phase to the next worker.
 * `priorOutputs` is keyed by the producing phase so each new
 * worker sees a clean, fresh context (only the artefacts it
 * needs, not the full transcript).
 */
export type PhaseHandoff = {
  feature: string;
  fromPhase: LoomPhase | null;
  toPhase: LoomPhase;
  state: PhaseState;
  context: SessionContext | null;
  plan: PhasePlan | null;
  /** Map of phase name → markdown excerpt of that phase's output. */
  priorOutputs: { [phase: string]: string };
};

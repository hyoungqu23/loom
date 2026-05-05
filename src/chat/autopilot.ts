import { LoomPhase, LOOM_PHASES } from "../types.js";
import { inferStartPhase } from "../phases/start-phase.js";
import { buildHandoff } from "../phases/session.js";
import type { ChatState } from "./state.js";

/**
 * Default last phase the chat autopilot loop runs before stopping after a
 * `proceed` gate. Mirrors the CLI autopilot's default and matches the
 * phase order in `LOOM_PHASES`.
 */
export const DEFAULT_AUTOPILOT_END_PHASE: LoomPhase = "reflect";

/**
 * Return the phase that comes after `current` in the canonical
 * `LOOM_PHASES` order, or `null` when `current` is the last phase or
 * not a recognised phase name. Used by the chat autopilot loop to
 * advance after a `proceed` gate.
 */
export function nextLoomPhase(current: LoomPhase): LoomPhase | null {
  const idx = LOOM_PHASES.indexOf(current);
  if (idx === -1) return null;
  if (idx === LOOM_PHASES.length - 1) return null;
  return LOOM_PHASES[idx + 1];
}

/**
 * Decide whether a `proceed` gate ends the autopilot loop. The loop
 * ends at the configured end phase or when there are no more phases.
 */
export function isAutopilotEnd(
  finishedPhase: LoomPhase,
  endPhase: LoomPhase,
): boolean {
  if (finishedPhase === endPhase) return true;
  return nextLoomPhase(finishedPhase) === null;
}

/**
 * Resolve the start phase for `/autopilot <task>` when the user did
 * not pass an explicit `--start <phase>`. We delegate to the same
 * inferStartPhase routing the CLI uses (harness/start-phase.md
 * regexes + state guards from CONTEXT.md / PLAN.md presence). The
 * inferred phase is preferred when it actually advances past the
 * snapshot's currentPhase; otherwise we keep currentPhase so a user
 * who is mid-session doesn't get bounced backwards.
 */
export function inferAutopilotStartPhase(
  state: ChatState,
  task: string,
): LoomPhase {
  let inferred: LoomPhase | null = null;
  try {
    const handoff = buildHandoff(state.sessionDir, "discuss");
    inferred = inferStartPhase(task, handoff).phase;
  } catch {
    // STATE.md missing or session unreadable — fall through.
    inferred = null;
  }
  if (!inferred) return state.currentPhase;
  const inferredIdx = LOOM_PHASES.indexOf(inferred);
  const currentIdx = LOOM_PHASES.indexOf(state.currentPhase);
  // Don't regress: if inference points earlier than currentPhase,
  // honour the user's progress and start at currentPhase.
  if (inferredIdx < currentIdx) return state.currentPhase;
  return inferred;
}

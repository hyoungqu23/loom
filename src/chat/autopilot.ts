import { LoomPhase, LOOM_PHASES } from "../types.js";

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

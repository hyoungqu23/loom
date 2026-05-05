/**
 * Shared chat-layer tunables. Kept in one file so detail-panel
 * builders and the reducer agree on the same numbers without each
 * file re-deriving its own.
 */

/** Max bytes of any single artefact preview rendered into the detail panel. */
export const PREVIEW_BYTES = 4000;

/** Per-worker stdout head shown when the detail panel falls back to worker summary. */
export const WORKER_HEAD_BYTES = 200;

/**
 * Hard cap on the number of TranscriptMessage entries kept in the
 * chat reducer. Going past this means a long-running session can no
 * longer accumulate megabytes of progress messages and force Ink to
 * re-paint the entire history every keystroke.
 */
export const TRANSCRIPT_MAX = 500;

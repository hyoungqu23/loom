/**
 * Default timeout for any single LLM CLI invocation.
 * Used by team workers and phase runners so a long-running agent isn't
 * killed early just because it ran inside a larger orchestration.
 */
export const DEFAULT_RUNTIME_TIMEOUT_MS = 600_000; // 10 min

/** Maximum buffer for spawnSync stdout/stderr capture. */
export const RUNTIME_OUTPUT_BUFFER = 50 * 1024 * 1024;

/** Soft timeout used when killing a child after SIGTERM hasn't worked. */
export const KILL_GRACE_MS = 2_000;

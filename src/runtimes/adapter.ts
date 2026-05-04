import { RunOptions, RuntimeConfig, RuntimeSpec } from "../types";

/** A runtime adapter knows how to translate a prompt + options into a child process spec. */
export type RuntimeAdapter = {
  /** Stable runtime identifier (matches keys in defaults.runtimes). */
  name: string;
  /** Build the spawn() arguments for this runtime. */
  buildSpec(args: BuildSpecArgs): RuntimeSpec;
  /** Arguments passed to the runtime CLI for `--version`. */
  versionArgs: string[];
  /**
   * Environment variable names this runtime needs from the host.
   * Entries ending in `*` match by prefix (e.g. `CODEX_*` matches `CODEX_HOME`).
   * Common system variables (PATH/HOME/TMPDIR/LANG/etc.) are merged in by
   * `buildRuntimeCommand` and do not need to be repeated per adapter.
   */
  envAllowlist?: string[];
};

export type BuildSpecArgs = {
  prompt: string;
  cwd: string;
  model: string;
  config: RuntimeConfig;
  options: RunOptions;
};

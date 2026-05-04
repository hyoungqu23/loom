/**
 * Build the environment object passed to spawned runtime children.
 *
 * Loom drives external LLM CLIs which can in turn execute arbitrary
 * commands. Passing the entire host env unfiltered means AWS / DB /
 * payment credentials reach the child even when they have nothing to
 * do with model invocation. The default behaviour now restricts the
 * child env to (a) common system variables that every shell needs, and
 * (b) the per-runtime allowlist declared by the adapter.
 *
 * Operators who need full passthrough (debugging missing keys, custom
 * adapter without an allowlist, etc.) can set
 * `RunOptions.envPassthrough = "full"` or pass `--env-passthrough full`
 * on the CLI.
 */

/** System variables every runtime needs to start up correctly. */
export const COMMON_RUNTIME_ENV: readonly string[] = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "COLORTERM",
  "PWD",
];

function matches(key: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return key.startsWith(pattern.slice(0, -1));
  }
  return key === pattern;
}

export function filterEnv(
  source: NodeJS.ProcessEnv,
  allowlist: readonly string[],
): NodeJS.ProcessEnv {
  const patterns = [...COMMON_RUNTIME_ENV, ...allowlist];
  const out: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value === undefined) continue;
    if (patterns.some((pattern) => matches(key, pattern))) {
      out[key] = value;
    }
  }
  return out;
}

export function countFilteredKeys(
  source: NodeJS.ProcessEnv,
  filtered: NodeJS.ProcessEnv,
): number {
  return Object.keys(source).length - Object.keys(filtered).length;
}

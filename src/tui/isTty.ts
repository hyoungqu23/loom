/**
 * TTY + color env detection. Pure: takes a snapshot of `isTTY` and
 * `env`, returns booleans / mode strings. The driver/sink wires this
 * to `process.stdout.isTTY` and `process.env`.
 *
 * Precedence (matching the no-color.org spec + common conventions):
 *   1. NO_COLOR set to any non-empty value → no color
 *   2. else FORCE_COLOR set and not "0"        → color
 *   3. else isTTY                              → color if true
 */

import type { ColorMode } from "./ansi";

export type TtyEnv = {
  isTTY: boolean;
  env: Record<string, string | undefined>;
};

function noColorOn(env: Record<string, string | undefined>): boolean {
  const v = env.NO_COLOR;
  return typeof v === "string" && v.length > 0;
}

function forceColorOn(env: Record<string, string | undefined>): boolean {
  const v = env.FORCE_COLOR;
  return typeof v === "string" && v !== "0" && v.length > 0;
}

export function detectColorMode(t: TtyEnv): ColorMode {
  if (noColorOn(t.env)) return "none";
  if (forceColorOn(t.env)) return "ansi";
  return t.isTTY ? "ansi" : "none";
}

/**
 * Whether the live frame should render. Requires a real TTY (cursor
 * sequences require it) AND no NO_COLOR override. FORCE_COLOR alone
 * does not enable the frame — tests inject a frame-enabled sink
 * directly.
 */
export function detectFrameEnabled(t: TtyEnv): boolean {
  if (!t.isTTY) return false;
  if (noColorOn(t.env)) return false;
  return true;
}

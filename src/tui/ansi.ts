/**
 * ANSI escape primitives. Zero deps. Cursor sequences are always raw —
 * the driver only emits them in TTY mode, so a "none" color mode does
 * not need to mask them. SGR colors collapse to identity when mode is
 * "none", which lets `frame.ts` build strings without branching.
 */

export const ESC = "\x1b";

export type ColorMode = "ansi" | "none";

export type Ansi = {
  green: (s: string) => string;
  cyan: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
  cursorUp: (n: number) => string;
  clearLine: string;
  hideCursor: string;
  showCursor: string;
};

function sgr(code: number): (s: string) => string {
  return (s: string) => `${ESC}[${code}m${s}${ESC}[0m`;
}

const identity = (s: string) => s;

export function createAnsi(mode: ColorMode): Ansi {
  const color = mode === "ansi";
  return {
    green: color ? sgr(32) : identity,
    cyan: color ? sgr(36) : identity,
    red: color ? sgr(31) : identity,
    yellow: color ? sgr(33) : identity,
    dim: color ? sgr(2) : identity,
    bold: color ? sgr(1) : identity,
    cursorUp: (n: number) => (n > 0 ? `${ESC}[${n}F` : ""),
    clearLine: `${ESC}[2K`,
    hideCursor: `${ESC}[?25l`,
    showCursor: `${ESC}[?25h`,
  };
}

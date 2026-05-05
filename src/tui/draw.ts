/**
 * Multi-line block redraw surface. Inspired by sindresorhus/log-update
 * (MIT, ~80 lines), reimplemented inline to keep deps at zero.
 *
 * Invariants:
 * - The block is always the LAST thing on screen. Any logs written
 *   externally must go through `sink.ts`, which clears + re-renders
 *   around the log line so the frame stays at the bottom.
 * - After every successful `render`, the cursor sits one row below
 *   the last line of the block (just like a normal `console.log`).
 * - SIGWINCH (terminal resize) invalidates the prior cursor math
 *   because lines may have wrapped differently. Caller signals via
 *   `handleResize()` and the next render starts fresh with no
 *   cursor-up — the user accepts a one-frame visual seam in exchange
 *   for not corrupting scrollback.
 */

import { ESC } from "./ansi.js";

export type DrawSurface = {
  render(lines: string[]): void;
  clear(): void;
  /** Lock the surface in place; further render() calls are ignored. */
  done(): void;
  /** Caller wires this to SIGWINCH. */
  handleResize(): void;
};

export function createDrawSurface(out: NodeJS.WritableStream): DrawSurface {
  let prevLineCount = 0;
  let stopped = false;

  function moveUpAndErase(lines: number): string {
    if (lines <= 0) return "";
    return `${ESC}[${lines}F${ESC}[J`;
  }

  return {
    render(lines: string[]): void {
      if (stopped) return;
      if (lines.length === 0) return;
      const prefix = moveUpAndErase(prevLineCount);
      out.write(prefix + lines.join("\n") + "\n");
      prevLineCount = lines.length;
    },
    clear(): void {
      if (stopped) return;
      if (prevLineCount === 0) return;
      out.write(moveUpAndErase(prevLineCount));
      prevLineCount = 0;
    },
    done(): void {
      stopped = true;
    },
    handleResize(): void {
      // Forget previous cursor math. Next render writes fresh, accepting
      // a one-frame visual seam over the risk of corrupting scrollback.
      prevLineCount = 0;
    },
  };
}

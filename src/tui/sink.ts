/**
 * Sink — abstracts how lines reach the user. Two flavours:
 *
 * - `createPlainSink`: non-TTY fallback. log() writes one line, refresh
 *   and finalize are no-ops. Output is byte-for-byte identical to the
 *   pre-TUI Loom logs.
 *
 * - `createFrameSink`: TTY mode. Holds a draw surface anchored to the
 *   bottom of the screen and a `getLines` callback that pulls the
 *   current frame from the driver. Every log line clears the frame,
 *   prints the line at the cursor, and re-renders the frame underneath.
 */

import { createDrawSurface, type DrawSurface } from "./draw";

export type Sink = {
  log(line: string): void;
  refresh(): void;
  finalize(): void;
  /**
   * Suspend frame redraws. While paused, `log()` writes the line
   * directly without re-rendering the frame underneath. The surface
   * is cleared on entry so the cursor is at a clean line below all
   * prior content. Used by gate prompts where multi-line synthesis
   * preview output would otherwise corrupt the cursor-up math.
   */
  pause(): void;
  resume(): void;
  /** Wired to SIGWINCH by the driver in TTY mode. */
  handleResize(): void;
};

export function createPlainSink(out: NodeJS.WritableStream): Sink {
  return {
    log(line: string): void {
      out.write(`${line}\n`);
    },
    refresh(): void {},
    finalize(): void {},
    pause(): void {},
    resume(): void {},
    handleResize(): void {},
  };
}

export function createFrameSink(
  out: NodeJS.WritableStream,
  getLines: () => string[],
): Sink {
  const surface: DrawSurface = createDrawSurface(out);
  let stopped = false;
  let paused = false;

  return {
    log(line: string): void {
      if (stopped) return;
      if (paused) {
        // No surface manipulation — frame is already cleared. Write the
        // line directly so multi-line content doesn't accumulate against
        // a stale prevLineCount.
        out.write(`${line}\n`);
        return;
      }
      surface.clear();
      out.write(`${line}\n`);
      surface.render(getLines());
    },
    refresh(): void {
      if (stopped || paused) return;
      surface.render(getLines());
    },
    finalize(): void {
      if (stopped) return;
      // Force a fresh final render at the current cursor position so
      // the pinned receipt sits below whatever just printed.
      surface.handleResize();
      surface.render(getLines());
      surface.done();
      stopped = true;
    },
    pause(): void {
      if (stopped || paused) return;
      surface.clear();
      paused = true;
    },
    resume(): void {
      if (stopped || !paused) return;
      paused = false;
      // Render afresh at the current cursor — gate output may have
      // shifted us far below the original frame anchor.
      surface.handleResize();
      surface.render(getLines());
    },
    handleResize(): void {
      if (stopped) return;
      surface.handleResize();
    },
  };
}

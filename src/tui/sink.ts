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
    handleResize(): void {},
  };
}

export function createFrameSink(
  out: NodeJS.WritableStream,
  getLines: () => string[],
): Sink {
  const surface: DrawSurface = createDrawSurface(out);
  let stopped = false;

  return {
    log(line: string): void {
      if (stopped) return;
      surface.clear();
      out.write(`${line}\n`);
      surface.render(getLines());
    },
    refresh(): void {
      if (stopped) return;
      surface.render(getLines());
    },
    finalize(): void {
      if (stopped) return;
      surface.render(getLines());
      surface.done();
      stopped = true;
    },
    handleResize(): void {
      if (stopped) return;
      surface.handleResize();
    },
  };
}

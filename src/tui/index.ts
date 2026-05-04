/**
 * Public TUI entry point. Wires environment detection + driver
 * construction + SIGWINCH handling so callers (runner, autopilot,
 * doctor) just call `createRenderer(process.stdout)` and get a
 * driver that does the right thing in TTY and non-TTY environments.
 */

import {
  createFrameDriver,
  type DriverScheduler,
  type FrameDriver,
} from "./driver";
import { detectColorMode, detectFrameEnabled, type TtyEnv } from "./isTty";

export type {
  FrameDriver,
  PhaseSummary,
  DriverScheduler,
} from "./driver";
export { createGateProvider } from "./gate";
export type { GateContext, GateOutcome, GateProvider } from "./gate";
export type { ColorMode } from "./ansi";

export type CreateRendererOptions = {
  feature?: string;
  /** Override TTY detection (defaults to process.stdout.isTTY). */
  isTTY?: boolean;
  /** Override env detection (defaults to process.env). */
  env?: Record<string, string | undefined>;
  /** Override scheduler (mostly for tests). */
  scheduler?: DriverScheduler;
  tickMs?: number;
  /** Override SIGWINCH wiring (defaults to process). */
  onResize?: (handler: () => void) => () => void;
};

function defaultOnResize(handler: () => void): () => void {
  process.on("SIGWINCH", handler);
  return () => {
    process.off("SIGWINCH", handler);
  };
}

export function createRenderer(
  out: NodeJS.WritableStream,
  opts: CreateRendererOptions = {},
): FrameDriver {
  const isTTY =
    opts.isTTY ?? Boolean((out as { isTTY?: boolean }).isTTY ?? false);
  const env = opts.env ?? process.env;
  const ttyEnv: TtyEnv = { isTTY, env };
  const colorMode = detectColorMode(ttyEnv);
  const frameEnabled = detectFrameEnabled(ttyEnv);
  const asciiOnly = colorMode === "none";

  const driver = createFrameDriver({
    out,
    frameEnabled,
    colorMode,
    asciiOnly,
    feature: opts.feature,
    scheduler: opts.scheduler,
    tickMs: opts.tickMs,
  });

  // SIGWINCH wiring (TTY only — useless when frame is off).
  let unsubscribeResize: (() => void) | null = null;
  if (frameEnabled) {
    const handler = () => {
      // The sink owns the surface; we only have a public seam through
      // pause/resume. On resize, pause+resume forces a fresh re-render
      // without the (now-stale) prevLineCount cursor math.
      driver.pauseFrame();
      driver.resumeFrame();
    };
    unsubscribeResize = (opts.onResize ?? defaultOnResize)(handler);
  }

  const originalShutdown = driver.shutdown;
  driver.shutdown = () => {
    if (unsubscribeResize) {
      unsubscribeResize();
      unsubscribeResize = null;
    }
    originalShutdown();
  };

  return driver;
}

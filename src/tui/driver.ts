/**
 * FrameDriver — owns the RenderState and routes structured events to
 * either the live frame (TTY) or the legacy '[loom] ...' log lines
 * (non-TTY). The non-TTY path is byte-for-byte identical to the
 * pre-TUI Loom logs so CI redirects remain stable.
 */

import { LOOM_PHASES, type LoomPhase } from "../types";
import type { ColorMode } from "./ansi";
import {
  renderFrame,
  type PhaseRow,
  type RenderState,
  type TerminalReason,
} from "./frame";
import { createFrameSink, createPlainSink, type Sink } from "./sink";

export type PhaseSummary = {
  workers: number;
  outBytes: number;
  elapsedMs: number;
  failed: number;
};

export type FrameDriver = {
  setFeature(name: string): void;
  startPhase(name: LoomPhase, personas: string[]): void;
  workerProgress(persona: string, deltaBytes: number): void;
  workerDone(persona: string, status: number | null, signal: string | null): void;
  workerError(persona: string, reason: string): void;
  endPhase(name: LoomPhase, summary: PhaseSummary): void;
  log(line: string): void;
  pauseFrame(): void;
  resumeFrame(): void;
  /** Switch the footer to a final receipt before shutdown. */
  markEnd(reason: TerminalReason): void;
  shutdown(): void;
  /** Test-only escape hatch for assertions on internal RenderState. */
  __getState(): RenderState;
};

export type DriverScheduler = {
  setInterval(fn: () => void, ms: number): () => void;
};

export type DriverOptions = {
  out: NodeJS.WritableStream;
  frameEnabled: boolean;
  colorMode: ColorMode;
  asciiOnly: boolean;
  feature?: string;
  now?: () => number;
  scheduler?: DriverScheduler;
  tickMs?: number;
};

const realScheduler: DriverScheduler = {
  setInterval(fn, ms) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
};

function initialPhases(): PhaseRow[] {
  return LOOM_PHASES.map<PhaseRow>((phase) => ({ phase, status: "queued" }));
}

export function createFrameDriver(opts: DriverOptions): FrameDriver {
  const now = opts.now ?? Date.now;
  const tickMs = opts.tickMs ?? 250;
  const scheduler = opts.scheduler ?? realScheduler;

  const state: RenderState = {
    feature: opts.feature ?? "",
    phases: initialPhases(),
    now: now(),
    tick: 0,
    asciiOnly: opts.asciiOnly,
    colorMode: opts.colorMode,
    nextGateEtaMs: null,
    terminal: null,
  };

  const sink: Sink = opts.frameEnabled
    ? createFrameSink(opts.out, () => {
        state.now = now();
        return renderFrame(state);
      })
    : createPlainSink(opts.out);

  let stopTick: (() => void) | null = null;
  if (opts.frameEnabled) {
    stopTick = scheduler.setInterval(() => {
      state.tick += 1;
      state.now = now();
      sink.refresh();
    }, tickMs);
  }

  function findPhaseIndex(phase: LoomPhase): number {
    return state.phases.findIndex((p) => p.phase === phase);
  }

  function plainLine(line: string): void {
    sink.log(line);
  }

  // ---- Public methods ----

  function setFeature(name: string): void {
    state.feature = name;
    if (opts.frameEnabled) sink.refresh();
  }

  function startPhase(name: LoomPhase, personas: string[]): void {
    if (!opts.frameEnabled) {
      plainLine(`[loom] phase: ${name}  personas: ${personas.join(", ")}`);
      return;
    }
    const idx = findPhaseIndex(name);
    if (idx === -1) return;
    const startedAt = now();
    state.phases[idx] = {
      phase: name,
      status: "active",
      startedAt,
      workers: personas.map((p) => ({
        persona: p,
        startedAt,
        outBytes: 0,
        status: "running",
      })),
    };
    sink.refresh();
  }

  function workerProgress(persona: string, deltaBytes: number): void {
    if (!opts.frameEnabled) return;
    const active = state.phases.find((p) => p.status === "active");
    if (!active || active.status !== "active") return;
    const w = active.workers.find((x) => x.persona === persona);
    if (!w) return;
    w.outBytes += deltaBytes;
    // No refresh on every byte — tick scheduler will fold it in.
  }

  function workerDone(
    persona: string,
    status: number | null,
    signal: string | null,
  ): void {
    if (!opts.frameEnabled) {
      const sigSuffix = signal ? ` signal=${signal}` : "";
      plainLine(`[loom] done  ${persona} status=${status}${sigSuffix}`);
      return;
    }
    const active = state.phases.find((p) => p.status === "active");
    if (active && active.status === "active") {
      const w = active.workers.find((x) => x.persona === persona);
      if (w) w.status = status === 0 ? "done" : "failed";
    }
    sink.refresh();
  }

  function workerError(persona: string, reason: string): void {
    if (!opts.frameEnabled) {
      const firstLine = reason.split("\n")[0];
      plainLine(`[loom] error ${persona} ${firstLine}`);
      return;
    }
    const active = state.phases.find((p) => p.status === "active");
    if (active && active.status === "active") {
      const w = active.workers.find((x) => x.persona === persona);
      if (w) w.status = "failed";
    }
    sink.refresh();
  }

  function endPhase(name: LoomPhase, summary: PhaseSummary): void {
    if (!opts.frameEnabled) return;
    const idx = findPhaseIndex(name);
    if (idx === -1) return;
    state.phases[idx] = {
      phase: name,
      status: "done",
      personas: summary.workers,
      outBytes: summary.outBytes,
      elapsedMs: summary.elapsedMs,
      failed: summary.failed,
    };
    sink.refresh();
  }

  function log(line: string): void {
    plainLine(line);
  }

  function pauseFrame(): void {
    if (!opts.frameEnabled) return;
    // Stop the tick so it doesn't redraw underneath the gate prompt.
    if (stopTick) {
      stopTick();
      stopTick = null;
    }
    // Suspend sink redraws so multi-line gate logs (synthesis preview)
    // don't accumulate against a stale prevLineCount.
    sink.pause();
  }

  function resumeFrame(): void {
    if (!opts.frameEnabled) return;
    sink.resume();
    if (!stopTick) {
      stopTick = scheduler.setInterval(() => {
        state.tick += 1;
        state.now = now();
        sink.refresh();
      }, tickMs);
    }
  }

  function markEnd(reason: TerminalReason): void {
    state.terminal = reason;
    if (opts.frameEnabled) sink.refresh();
  }

  function shutdown(): void {
    if (stopTick) {
      stopTick();
      stopTick = null;
    }
    sink.finalize();
  }

  return {
    setFeature,
    startPhase,
    workerProgress,
    workerDone,
    workerError,
    endPhase,
    log,
    pauseFrame,
    resumeFrame,
    markEnd,
    shutdown,
    __getState: () => state,
  };
}

/**
 * Pure renderer: (state) => string[]. No I/O. No timers. No env reads.
 *
 * The frame is designed receipt-first: the final frozen state when all
 * 7 phases are done is the spec, and live ticks are reverse-engineered
 * from that. Every transient row collapses into a stable summary row
 * once the phase finishes.
 */

import { LOOM_PHASES, type LoomPhase } from "../types.js";
import { createAnsi, type Ansi, type ColorMode } from "./ansi.js";
import {
  formatBytes,
  formatDuration,
  formatPersonaLabel,
  icons,
  type Icons,
} from "./format.js";

export type WorkerRow = {
  persona: string;
  startedAt: number;
  outBytes: number;
  status: "running" | "done" | "failed";
};

export type PhaseRow =
  | { phase: LoomPhase; status: "queued" }
  | {
      phase: LoomPhase;
      status: "active";
      startedAt: number;
      workers: WorkerRow[];
    }
  | {
      phase: LoomPhase;
      status: "done";
      personas: number;
      outBytes: number;
      elapsedMs: number;
      /** non-zero ⇒ phase ended with failures, render with ✗ icon */
      failed: number;
    };

export type TerminalReason = "completed" | "aborted";

export type RenderState = {
  feature: string;
  /** length-7 array, one row per LoomPhase, in `LOOM_PHASES` order */
  phases: PhaseRow[];
  /** ms timestamp used for elapsed math on active rows */
  now: number;
  /** monotonic counter for worker pulse animation parity */
  tick: number;
  asciiOnly: boolean;
  colorMode: ColorMode;
  /** ms hint for "next gate ~30s" footer; null when unknown */
  nextGateEtaMs?: number | null;
  /** Set by the driver on shutdown; switches the footer to a final receipt. */
  terminal?: TerminalReason | null;
};

const PHASE_COL = 7; // pad name to "discuss"/"reflect" width
const COUNT_COL = 10; // "1 persona " or "2 personas"
const BYTES_COL = 10; // "2.3 KB out" / "410 B out "
const PERSONA_COL = 8; // "ryze    " / "zilean  "

function padEnd(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

function pulseGlyph(tick: number, asciiOnly: boolean): string {
  const even = tick % 2 === 0;
  if (asciiOnly) return even ? "*" : "o";
  return even ? "◐" : "●";
}

function workerLine(
  w: WorkerRow,
  now: number,
  tick: number,
  ansi: Ansi,
  ic: Icons,
  asciiOnly: boolean,
): string {
  const elapsed = formatDuration(now - w.startedAt);
  const delta = formatBytes(w.outBytes, { delta: true });
  let glyph: string;
  let painted: string;
  if (w.status === "failed") {
    glyph = ic.failed;
    painted = ansi.red(glyph);
  } else if (w.status === "done") {
    glyph = ic.done;
    painted = ansi.green(glyph);
  } else {
    glyph = pulseGlyph(tick, asciiOnly);
    painted = ansi.cyan(glyph);
  }
  return `      ${formatPersonaLabel(w.persona, PERSONA_COL)}${painted} ${elapsed}  ${delta}`;
}

function doneLine(
  row: Extract<PhaseRow, { status: "done" }>,
  ansi: Ansi,
  ic: Icons,
): string {
  const failedPhase = row.failed > 0;
  const glyph = failedPhase ? ic.failed : ic.done;
  const painted = failedPhase ? ansi.red(glyph) : ansi.green(glyph);
  const personasText = `${row.personas} ${row.personas === 1 ? "persona" : "personas"}`;
  const bytesText = `${formatBytes(row.outBytes)} out`;
  const elapsed = formatDuration(row.elapsedMs);
  const failedSuffix = failedPhase
    ? `   ${ansi.red(`${row.failed} failed`)}`
    : "";
  return (
    `  ${painted} ${padEnd(row.phase, PHASE_COL)}   ` +
    `${padEnd(personasText, COUNT_COL)}   ` +
    `${padEnd(bytesText, BYTES_COL)}   ${elapsed}${failedSuffix}`
  );
}

function activeHeaderLine(
  row: Extract<PhaseRow, { status: "active" }>,
  ansi: Ansi,
  ic: Icons,
): string {
  return `  ${ansi.cyan(ic.active)} ${row.phase}`;
}

function queuedLine(phase: LoomPhase, ansi: Ansi, ic: Icons): string {
  return `  ${ansi.dim(ic.queued)} ${padEnd(phase, PHASE_COL)}   queued`;
}

function aggregate(state: RenderState): { bytes: number; ms: number; lastDone: LoomPhase | null } {
  let bytes = 0;
  let ms = 0;
  let lastDone: LoomPhase | null = null;
  for (const p of state.phases) {
    if (p.status === "done") {
      bytes += p.outBytes;
      ms += p.elapsedMs;
      lastDone = p.phase;
    }
  }
  return { bytes, ms, lastDone };
}

function statusFooter(state: RenderState, ansi: ReturnType<typeof createAnsi>): string[] {
  if (state.terminal) {
    const { bytes, ms, lastDone } = aggregate(state);
    if (state.terminal === "aborted") {
      const where = lastDone ?? state.phases[0]?.phase ?? "discuss";
      return [
        "",
        `  ${ansi.red("aborted")} at ${where}   ${formatBytes(bytes)} out   ${formatDuration(ms)}`,
      ];
    }
    // completed
    return [
      "",
      `  ${ansi.green("done")} in ${formatDuration(ms)}   ${formatBytes(bytes)} out`,
    ];
  }
  const allDone =
    state.phases.length === LOOM_PHASES.length &&
    state.phases.every((p) => p.status === "done");
  if (allDone) {
    const { bytes, ms } = aggregate(state);
    return ["", `  ${ansi.green("done")} in ${formatDuration(ms)}   ${formatBytes(bytes)} out`];
  }
  const noneStarted = state.phases.every((p) => p.status === "queued");
  if (noneStarted) return ["", "  starting…"];
  if (state.nextGateEtaMs != null) {
    const sec = Math.round(state.nextGateEtaMs / 1000);
    return ["", `  next gate ~${sec}s`];
  }
  return ["", "  running…"];
}

export function renderFrame(state: RenderState): string[] {
  const ansi = createAnsi(state.colorMode);
  const ic = icons(state.asciiOnly);
  const out: string[] = [];

  const sep = state.asciiOnly ? ":" : "·";
  out.push(ansi.bold(`loom ${sep} ${state.feature}`));

  for (const row of state.phases) {
    if (row.status === "queued") {
      out.push(queuedLine(row.phase, ansi, ic));
      continue;
    }
    if (row.status === "active") {
      out.push(activeHeaderLine(row, ansi, ic));
      for (const w of row.workers) {
        out.push(
          workerLine(w, state.now, state.tick, ansi, ic, state.asciiOnly),
        );
      }
      continue;
    }
    out.push(doneLine(row, ansi, ic));
  }

  out.push(...statusFooter(state, ansi));
  return out;
}

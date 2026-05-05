/**
 * Colored gate prompt. Pauses the live frame, prints a yellow-bordered
 * receipt-style header, expands the synthesis preview window from 600
 * to 800 chars, then runs readline. Non-TTY mode is a no-color
 * fallback that preserves the original prompt copy verbatim.
 */

import * as readline from "readline";
import type { GateDecision, LoomPhase } from "../types.js";
import { createAnsi, type ColorMode } from "./ansi.js";

export type GateContext = {
  phase: LoomPhase;
  workersCount: number;
  synthesisExcerpt: string;
};

export type GateOutcome = {
  decision: GateDecision;
  note?: string;
};

export type GateProvider = (ctx: GateContext) => Promise<GateOutcome>;

export type GateDeps = {
  colorMode: ColorMode;
  asciiOnly: boolean;
  driver: {
    pauseFrame(): void;
    resumeFrame(): void;
    log(line: string): void;
  };
  /** Injectable readline factory for tests. */
  readline?: () => {
    question: (q: string) => Promise<string>;
    close: () => void;
  };
};

const SYNTHESIS_PREVIEW_CHARS = 800;

function defaultReadline() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return {
    question: (q: string) =>
      new Promise<string>((resolve) => {
        rl.question(q, (ans) => resolve(ans.trim()));
      }),
    close: () => rl.close(),
  };
}

function parseDecision(answer: string): GateDecision {
  const a = answer.toLowerCase().trim();
  if (a === "revise" || a === "r") return "revise";
  if (a === "abort" || a === "a") return "abort";
  return "proceed";
}

export function createGateProvider(deps: GateDeps): GateProvider {
  const ansi = createAnsi(deps.colorMode);
  const sep = deps.asciiOnly
    ? "--------------------------------------------"
    : "────────────────────────────────────────────";

  return async (ctx: GateContext): Promise<GateOutcome> => {
    deps.driver.pauseFrame();
    deps.driver.log("");
    deps.driver.log(ansi.yellow(sep));
    deps.driver.log(
      ansi.bold(
        `Phase complete: ${ctx.phase}  (workers=${ctx.workersCount})`,
      ),
    );
    if (ctx.synthesisExcerpt) {
      deps.driver.log(ansi.cyan("Synthesis preview:"));
      deps.driver.log(ctx.synthesisExcerpt.slice(0, SYNTHESIS_PREVIEW_CHARS));
    }

    const rl = (deps.readline ?? defaultReadline)();
    let answer: string;
    try {
      answer = await rl.question(
        "Gate decision [proceed/revise/abort] (default proceed): ",
      );
    } finally {
      rl.close();
    }

    deps.driver.resumeFrame();
    return { decision: parseDecision(answer) };
  };
}

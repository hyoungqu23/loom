import * as fs from "fs";
import * as path from "path";
import { LoomPhase, LOOM_PHASES } from "../types";
import { getPackageRoot } from "../workspace";
import { parseMarkdownTable } from "../util/markdown-table";

export type PhaseMatrixRule = {
  phase: LoomPhase;
  primary: string[];
  secondary: string[];
};

const PHASE_SET = new Set<string>(LOOM_PHASES);

const MATRIX_RELATIVE = path.join("harness", "phases.md");

/**
 * Built-in matrix used as a fallback when `harness/phases.md` is
 * absent. Mirrors the table documented in the agent design notes:
 *
 *   discuss   ryze              + zilean, local-fast
 *   plan      ornn, orianna     + hwei, zilean
 *   build     viktor            + kayle (inline)
 *   review    kayle, shen       + hwei
 *   verify    caitlyn           + viktor
 *   ship      viktor, shen      —
 *   reflect   bard              + shen
 */
export const BUILTIN_PHASE_MATRIX: PhaseMatrixRule[] = [
  {
    phase: "discuss",
    primary: ["ryze"],
    secondary: ["zilean", "local-fast"],
  },
  {
    phase: "plan",
    primary: ["ornn", "orianna"],
    secondary: ["hwei", "zilean"],
  },
  {
    phase: "build",
    primary: ["viktor"],
    secondary: ["kayle"],
  },
  {
    phase: "review",
    primary: ["kayle", "shen"],
    secondary: ["hwei"],
  },
  {
    phase: "verify",
    primary: ["caitlyn"],
    secondary: ["viktor"],
  },
  {
    phase: "ship",
    primary: ["viktor", "shen"],
    secondary: [],
  },
  {
    phase: "reflect",
    primary: ["bard"],
    secondary: ["shen"],
  },
];

function isLoomPhase(value: string): value is LoomPhase {
  return PHASE_SET.has(value);
}

function splitList(cell: string): string[] {
  return cell
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse a Markdown table of phase → personas. Code fences are stripped
 * first so rules embedded in `\`\`\`` examples are skipped.
 *
 * The first matching row per phase wins — mirrors runtime semantics in
 * `selectPersonas` (which uses `matrix.find`). This also lets the doc
 * include a secondary "intent" table that reuses phase names as labels
 * without polluting the parsed matrix.
 */
export function parsePhaseMatrix(markdown: string): PhaseMatrixRule[] {
  const seen = new Set<LoomPhase>();
  return parseMarkdownTable<PhaseMatrixRule>(
    markdown,
    (cells) => {
      const phase = cells[0].toLowerCase();
      if (!isLoomPhase(phase)) return null;
      if (seen.has(phase)) return null;
      const primary = splitList(cells[1] || "");
      if (primary.length === 0) return null;
      const secondary = splitList(cells[2] || "");
      seen.add(phase);
      return { phase, primary, secondary };
    },
    { headerCellValues: ["phase"] },
  );
}

export function loadPhaseMatrix(): PhaseMatrixRule[] {
  const filePath = path.join(getPackageRoot(), MATRIX_RELATIVE);
  if (!fs.existsSync(filePath)) return BUILTIN_PHASE_MATRIX;
  const parsed = parsePhaseMatrix(fs.readFileSync(filePath, "utf8"));
  return parsed.length > 0 ? parsed : BUILTIN_PHASE_MATRIX;
}

export function personasForPhase(
  matrix: PhaseMatrixRule[],
  phase: LoomPhase,
): string[] {
  const rule = matrix.find((r) => r.phase === phase);
  if (!rule) return [];
  return [...rule.primary, ...rule.secondary];
}

export function primaryPersonaForPhase(
  matrix: PhaseMatrixRule[],
  phase: LoomPhase,
): string | null {
  const rule = matrix.find((r) => r.phase === phase);
  if (!rule || rule.primary.length === 0) return null;
  return rule.primary[0];
}

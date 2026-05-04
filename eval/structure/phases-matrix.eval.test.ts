import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { loadDefaults } from "../../src/config";
import {
  loadPhaseMatrix,
  parsePhaseMatrix,
  BUILTIN_PHASE_MATRIX,
} from "../../src/phases/matrix";
import { LOOM_PHASES, LoomPhase } from "../../src/types";
import { getPackageRoot } from "../../src/workspace";

const matrixFile = path.join(getPackageRoot(), "harness", "phases.md");

const defaults = loadDefaults();
const personaNames = new Set(Object.keys(defaults.agents));

describe("harness/phases.md structure eval (E-3)", () => {
  it("harness/phases.md exists", () => {
    expect(fs.existsSync(matrixFile)).toBe(true);
  });

  const matrix = loadPhaseMatrix();

  it("returns at least one rule per LoomPhase", () => {
    const seen = new Set<LoomPhase>(matrix.map((r) => r.phase));
    for (const phase of LOOM_PHASES) {
      expect(seen.has(phase)).toBe(true);
    }
  });

  it("every rule has a non-empty primary list", () => {
    for (const rule of matrix) {
      expect(rule.primary.length).toBeGreaterThan(0);
    }
  });

  it("all referenced personas are registered in defaults.agents", () => {
    for (const rule of matrix) {
      for (const persona of [...rule.primary, ...rule.secondary]) {
        if (!personaNames.has(persona)) {
          throw new Error(
            `phases.md references unknown persona "${persona}" in phase ${rule.phase}`,
          );
        }
      }
    }
  });

  it("twistedfate is intentionally NOT registered in any phase row", () => {
    // Twisted Fate is the orchestrator/synthesizer and is wired in
    // separately by the runner — having it in phases.md would double-spawn.
    for (const rule of matrix) {
      expect(rule.primary).not.toContain("twistedfate");
      expect(rule.secondary).not.toContain("twistedfate");
    }
  });

  it("the file matrix at minimum covers what BUILTIN_PHASE_MATRIX covers", () => {
    // Each built-in primary persona for a phase should appear in the
    // file matrix's primary OR secondary for that phase. This is a
    // coverage check, not an exact equality — operators can extend.
    const fileByPhase = new Map(matrix.map((r) => [r.phase, r]));
    for (const builtin of BUILTIN_PHASE_MATRIX) {
      const fileRule = fileByPhase.get(builtin.phase);
      expect(fileRule, `missing phase ${builtin.phase} in phases.md`).toBeTruthy();
      const all = new Set([
        ...(fileRule?.primary ?? []),
        ...(fileRule?.secondary ?? []),
      ]);
      for (const required of builtin.primary) {
        expect(
          all.has(required),
          `phases.md missing built-in primary "${required}" for phase ${builtin.phase}`,
        ).toBe(true);
      }
    }
  });
});

describe("parsePhaseMatrix() malformed-row regression (E-3)", () => {
  it("skips rows with unknown phase or empty primary", () => {
    const md = [
      "| Phase | Primary | Secondary |",
      "|-------|---------|-----------|",
      "| nope  | someone |           |",
      "| plan  |         | hwei      |",
      "| build | viktor  | kayle     |",
      "",
    ].join("\n");
    const rules = parsePhaseMatrix(md);
    expect(rules).toHaveLength(1);
    expect(rules[0].phase).toBe("build");
    expect(rules[0].primary).toEqual(["viktor"]);
  });

  it("skips matrix rows inside fenced code blocks", () => {
    const md = [
      "```",
      "| Phase | Primary |",
      "| build | impostor |",
      "```",
      "",
      "| Phase | Primary | Secondary |",
      "|-------|---------|-----------|",
      "| ship  | viktor  | shen      |",
      "",
    ].join("\n");
    const rules = parsePhaseMatrix(md);
    expect(rules).toHaveLength(1);
    expect(rules[0].phase).toBe("ship");
  });
});

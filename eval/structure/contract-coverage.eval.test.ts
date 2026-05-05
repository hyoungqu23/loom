import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { loadDefaults } from "../../src/config.js";
import { loadPhaseMatrix } from "../../src/phases/matrix.js";
import {
  extractContextFromOutput,
  extractPlanFromOutput,
  isContextDeltaEmpty,
  isPlanDeltaEmpty,
} from "../../src/phases/extract.js";
import { LoomPhase } from "../../src/types.js";
import { getPackageRoot } from "../../src/workspace.js";

const defaults = loadDefaults();

function readContractForPersona(name: string): string {
  const agent = defaults.agents[name];
  if (!agent) return "";
  const contractKey = agent.contract || "default";
  const rel = defaults.outputContract[contractKey];
  if (!rel) return "";
  const abs = path.join(getPackageRoot(), rel);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8");
}

/**
 * Phases whose output is auto-extracted into a per-feature artefact.
 *  discuss → CONTEXT.md (extractContextFromOutput)
 *  plan    → PLAN.md    (extractPlanFromOutput)
 *
 * For these phases, every primary persona's contract must produce headings
 * that the matching extractor recognises — otherwise the auto-extract step
 * silently does nothing and the user is back to hand-editing artefacts.
 */
const PHASE_EXTRACTORS: {
  [phase: string]: (md: string) => boolean;
} = {
  discuss: (md) => !isContextDeltaEmpty(extractContextFromOutput(md)),
  plan: (md) => !isPlanDeltaEmpty(extractPlanFromOutput(md)),
};

describe("phase × contract coverage eval (C-4)", () => {
  const matrix = loadPhaseMatrix();

  for (const [phase, hasRecognisedHeading] of Object.entries(PHASE_EXTRACTORS)) {
    const rule = matrix.find((r) => r.phase === (phase as LoomPhase));
    if (!rule) continue;
    for (const persona of rule.primary) {
      it(`primary persona '${persona}' for phase '${phase}' has a contract with extractor-friendly headings`, () => {
        const contract = readContractForPersona(persona);
        expect(contract).not.toBe("");
        expect(
          hasRecognisedHeading(contract),
          `contract for ${persona} (phase=${phase}) has no headings the auto-extractor will pick up`,
        ).toBe(true);
      });
    }
  }

  it("every contract file declares a `## 확신도` section (existing invariant)", () => {
    for (const rel of Object.values(defaults.outputContract)) {
      const abs = path.join(getPackageRoot(), rel);
      if (!fs.existsSync(abs)) continue;
      const content = fs.readFileSync(abs, "utf8");
      expect(content).toContain("## 확신도");
    }
  });

  it("planning contract specifically exposes 결론/계획/리스크/미결 질문 sections", () => {
    // The auto-extractor depends on these in particular for the plan-fanout
    // phase. Phrase this as a hard schema check so a contract rewrite that
    // drops one of them gets caught.
    const planning = fs.readFileSync(
      path.join(getPackageRoot(), defaults.outputContract.planning),
      "utf8",
    );
    expect(planning).toMatch(/^##\s+결론 한 줄/m);
    expect(planning).toMatch(/^##\s+계획/m);
    expect(planning).toMatch(/^##\s+리스크/m);
    expect(planning).toMatch(/^##\s+미결 질문/m);
  });
});

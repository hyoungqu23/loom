import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_START_PHASE_RULES,
  inferStartPhase,
  loadStartPhaseRules,
  parseStartPhaseRules,
} from "../../src/phases/start-phase";
import { LoomPhase, PhaseHandoff, PhasePlan, SessionContext } from "../../src/types";
import { getPackageRoot } from "../../src/workspace";

type SessionState = "none" | "empty" | "context" | "planned";

type StartPhaseCase = {
  id: string;
  input: string;
  sessionState: SessionState;
  expectedPhase: LoomPhase;
  expectedConfidence?: "high" | "medium" | "low";
  expectedNoteRegex?: string;
};

type CaseFile = {
  cases: StartPhaseCase[];
};

const casesPath = path.join(__dirname, "cases.json");
const data: CaseFile = JSON.parse(fs.readFileSync(casesPath, "utf8"));

function emptyHandoff(): PhaseHandoff {
  return {
    feature: "eval-fixture",
    fromPhase: null,
    toPhase: "discuss",
    state: {
      feature: "eval-fixture",
      currentPhase: "discuss",
      history: ["discuss"],
      gates: [],
      blockers: [],
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T00:00:00.000Z",
    },
    context: null,
    plan: null,
    priorOutputs: {},
  };
}

function fakeContext(): SessionContext {
  return {
    problem: "fixture problem",
    user: "fixture user",
    glossary: [],
    decisions: [],
    nonGoals: [],
    openQuestions: [],
  };
}

function fakePlan(): PhasePlan {
  return {
    approach: "fixture plan",
    modules: [],
    acceptanceCriteria: [],
    testPlan: [],
    risks: [],
  };
}

function buildHandoffFor(state: SessionState): PhaseHandoff | null {
  if (state === "none") return null;
  const handoff = emptyHandoff();
  if (state === "context") {
    handoff.context = fakeContext();
  } else if (state === "planned") {
    handoff.context = fakeContext();
    handoff.plan = fakePlan();
  }
  return handoff;
}

describe("inferStartPhase eval (E-1)", () => {
  for (const c of data.cases) {
    it(`case ${c.id}: "${c.input}" (${c.sessionState})`, () => {
      const handoff = buildHandoffFor(c.sessionState);
      const result = inferStartPhase(c.input, handoff);
      expect(result.phase).toBe(c.expectedPhase);
      if (c.expectedConfidence) {
        expect(result.confidence).toBe(c.expectedConfidence);
      }
      if (c.expectedNoteRegex) {
        expect(result.note ?? "").toMatch(new RegExp(c.expectedNoteRegex, "i"));
      }
    });
  }
});

describe("start-phase.md parsing eval (E-2)", () => {
  const rulesFile = path.join(getPackageRoot(), "harness", "start-phase.md");

  it("harness/start-phase.md exists in the package", () => {
    expect(fs.existsSync(rulesFile)).toBe(true);
  });

  it("loadStartPhaseRules() returns at least as many rules as BUILTIN", () => {
    const rules = loadStartPhaseRules();
    expect(rules.length).toBeGreaterThanOrEqual(
      BUILTIN_START_PHASE_RULES.length,
    );
  });

  it("each parsed rule targets a valid LoomPhase", () => {
    const rules = loadStartPhaseRules();
    const validPhases = new Set([
      "discuss",
      "plan",
      "build",
      "review",
      "verify",
      "ship",
      "reflect",
    ]);
    for (const rule of rules) {
      expect(validPhases.has(rule.phase)).toBe(true);
    }
  });

  it("rules from the file resolve to RegExp instances", () => {
    const rules = loadStartPhaseRules();
    for (const rule of rules) {
      expect(rule.regex).toBeInstanceOf(RegExp);
    }
  });

  it("malformed rows are skipped (parser regression)", () => {
    const md = [
      "| Pattern | Phase |",
      "|---------|-------|",
      "| not-a-regex | discuss |",
      "| /ok/i | discuss |",
      "| /bad-target/i | not-a-phase |",
      "| /good/i | plan |",
      "",
    ].join("\n");
    const rules = parseStartPhaseRules(md);
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.phase)).toEqual(["discuss", "plan"]);
  });

  it("rule order matches the file (top-to-bottom)", () => {
    // Confirm the live file's first rule still maps to `discuss` —
    // PRD/idea-style requests must be checked before generic terms.
    const rules = loadStartPhaseRules();
    expect(rules[0].phase).toBe("discuss");
  });
});

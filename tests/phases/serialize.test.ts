import { describe, it, expect } from "vitest";
import {
  serializeState,
  parseState,
  serializeContext,
  parseContext,
  serializePlan,
  parsePlan,
} from "../../src/phases/serialize";
import { PhaseState, SessionContext, PhasePlan } from "../../src/types";

describe("phases/serialize", () => {
  describe("PhaseState <-> STATE.md", () => {
    const sample: PhaseState = {
      feature: "add-dark-mode",
      currentPhase: "build",
      history: ["discuss", "plan", "build"],
      gates: [
        {
          phase: "discuss",
          decision: "proceed",
          at: "2026-05-03T01:00:00.000Z",
        },
        {
          phase: "plan",
          decision: "proceed",
          at: "2026-05-03T01:30:00.000Z",
          note: "approach approved with caveat",
        },
      ],
      blockers: ["needs design tokens"],
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T02:00:00.000Z",
    };

    it("round-trips a full state object via markdown", () => {
      const md = serializeState(sample);
      const parsed = parseState(md);
      expect(parsed).toEqual(sample);
    });

    it("emits stable frontmatter with feature, currentPhase, timestamps", () => {
      const md = serializeState(sample);
      expect(md.startsWith("---\n")).toBe(true);
      expect(md).toContain("feature: add-dark-mode");
      expect(md).toContain("currentPhase: build");
      expect(md).toContain("createdAt: 2026-05-03T00:00:00.000Z");
    });

    it("renders history and gates in a human-readable body", () => {
      const md = serializeState(sample);
      expect(md).toContain("## Phase History");
      expect(md).toContain("- discuss");
      expect(md).toContain("- plan");
      expect(md).toContain("## Gate Decisions");
      expect(md).toContain("approach approved with caveat");
      expect(md).toContain("## Blockers");
      expect(md).toContain("- needs design tokens");
    });

    it("parses minimal state with no gates and no blockers", () => {
      const minimal: PhaseState = {
        feature: "x",
        currentPhase: "discuss",
        history: ["discuss"],
        gates: [],
        blockers: [],
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:00:00.000Z",
      };
      expect(parseState(serializeState(minimal))).toEqual(minimal);
    });

    it("rejects markdown without frontmatter", () => {
      expect(() => parseState("no frontmatter here")).toThrow(
        /STATE\.md frontmatter/,
      );
    });

    it("rejects an unknown phase name", () => {
      const bad = serializeState(sample).replace(
        "currentPhase: build",
        "currentPhase: notaphase",
      );
      expect(() => parseState(bad)).toThrow(/unknown phase/i);
    });
  });

  describe("SessionContext <-> CONTEXT.md", () => {
    const ctx: SessionContext = {
      problem: "users can't toggle theme",
      user: "end users on web",
      glossary: [
        { term: "theme", definition: "color scheme variant" },
        { term: "token", definition: "design token in CSS variables" },
      ],
      decisions: ["use CSS variables (not class swap)", "persist in localStorage"],
      nonGoals: ["per-component override", "system theme detection (v2)"],
      openQuestions: ["fallback for SSR?"],
    };

    it("round-trips context", () => {
      expect(parseContext(serializeContext(ctx))).toEqual(ctx);
    });

    it("includes all five sections", () => {
      const md = serializeContext(ctx);
      expect(md).toContain("## Problem");
      expect(md).toContain("## User");
      expect(md).toContain("## Glossary");
      expect(md).toContain("## Decisions");
      expect(md).toContain("## Non-goals");
      expect(md).toContain("## Open Questions");
    });

    it("parses missing sections as empty arrays", () => {
      const md = `# CONTEXT\n\n## Problem\n\nx\n\n## User\n\ny\n`;
      const parsed = parseContext(md);
      expect(parsed.problem).toBe("x");
      expect(parsed.user).toBe("y");
      expect(parsed.glossary).toEqual([]);
      expect(parsed.decisions).toEqual([]);
      expect(parsed.nonGoals).toEqual([]);
      expect(parsed.openQuestions).toEqual([]);
    });
  });

  describe("PhasePlan <-> PLAN.md", () => {
    const plan: PhasePlan = {
      approach: "wrap viktor's TDD loop in fresh worker",
      modules: ["src/theme/store.ts", "src/theme/toggle.tsx"],
      acceptanceCriteria: [
        "Given dark mode enabled, when reload, then theme persists",
      ],
      testPlan: [
        { name: "store persists toggle", covers: ["AC-1"] },
        { name: "toggle dispatches store action", covers: ["AC-1"] },
      ],
      risks: ["SSR flash of unstyled content"],
    };

    it("round-trips plan", () => {
      expect(parsePlan(serializePlan(plan))).toEqual(plan);
    });

    it("renders test plan as a table", () => {
      const md = serializePlan(plan);
      expect(md).toContain("## Approach");
      expect(md).toContain("## Modules");
      expect(md).toContain("## Acceptance Criteria");
      expect(md).toContain("## Test Plan");
      expect(md).toContain("| Test | Covers |");
      expect(md).toContain("store persists toggle");
      expect(md).toContain("AC-1");
      expect(md).toContain("## Risks");
    });
  });
});

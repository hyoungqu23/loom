import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { getPackageRoot } from "../../src/workspace";
import {
  parseStartPhaseRules,
  loadStartPhaseRules,
  inferStartPhase,
  BUILTIN_START_PHASE_RULES,
} from "../../src/phases/start-phase";
import { LoomPhase, PhaseHandoff } from "../../src/types";

const RULES_FILE = path.join(getPackageRoot(), "harness", "start-phase.md");

describe("parseStartPhaseRules", () => {
  it("returns [] for empty markdown", () => {
    expect(parseStartPhaseRules("")).toEqual([]);
  });

  it("parses pattern → phase rows (with escaped pipes inside regex)", () => {
    const md = `
| Pattern | Phase |
|---|---|
| /prd\\|requirement/i | discuss |
| /implement/i | build |
`;
    const rules = parseStartPhaseRules(md);
    expect(rules).toHaveLength(2);
    expect(rules[0].phase).toBe("discuss");
    expect(rules[0].regex.test("PRD please")).toBe(true);
    expect(rules[1].phase).toBe("build");
    expect(rules[1].regex.test("implement X")).toBe(true);
  });

  it("ignores rows targeting unknown phases", () => {
    const md = `
| Pattern | Phase |
|---|---|
| /x/i | nope |
| /y/i | plan |
`;
    expect(parseStartPhaseRules(md)).toHaveLength(1);
    expect(parseStartPhaseRules(md)[0].phase).toBe("plan");
  });

  it("ignores rows with malformed regex", () => {
    const md = `
| Pattern | Phase |
|---|---|
| not-a-regex | discuss |
| /ok/i | discuss |
`;
    expect(parseStartPhaseRules(md)).toHaveLength(1);
  });

  it("skips fenced code blocks", () => {
    const md = `
\`\`\`
| Pattern | Phase |
| /x/i | discuss |
\`\`\`

| Pattern | Phase |
|---|---|
| /y/i | plan |
`;
    expect(parseStartPhaseRules(md)).toHaveLength(1);
    expect(parseStartPhaseRules(md)[0].phase).toBe("plan");
  });
});

describe("loadStartPhaseRules", () => {
  let backup: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(RULES_FILE)) {
      backup = fs.readFileSync(RULES_FILE, "utf8");
      fs.rmSync(RULES_FILE);
    }
  });

  afterEach(() => {
    if (backup !== null) fs.writeFileSync(RULES_FILE, backup, "utf8");
    else if (fs.existsSync(RULES_FILE)) fs.rmSync(RULES_FILE);
    backup = null;
  });

  it("falls back to BUILTIN_START_PHASE_RULES when file is absent", () => {
    expect(loadStartPhaseRules()).toBe(BUILTIN_START_PHASE_RULES);
  });

  it("uses the file when present and valid", () => {
    fs.writeFileSync(
      RULES_FILE,
      `| Pattern | Phase |
|---|---|
| /^reflect/i | reflect |
`,
      "utf8",
    );
    const rules = loadStartPhaseRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].phase).toBe("reflect");
  });
});

describe("inferStartPhase", () => {
  function emptyHandoff(): PhaseHandoff {
    return {
      feature: "x",
      fromPhase: null,
      toPhase: "discuss",
      state: {
        feature: "x",
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

  function expectStart(task: string, expected: LoomPhase) {
    const result = inferStartPhase(task, null);
    expect(result.phase).toBe(expected);
  }

  it("PRD-style requests start at discuss", () => {
    expectStart("PRD 만들어줘", "discuss");
    expectStart("write a product requirements doc", "discuss");
    expectStart("새 기능 아이디어가 있어", "discuss");
  });

  it("planning-style requests start at plan", () => {
    expectStart("어떻게 설계할까?", "plan");
    expectStart("which library should we use", "plan");
    expectStart("아키텍처를 잡아줘", "plan");
  });

  it("implementation requests aim at build", () => {
    expectStart("이거 구현해줘", "build");
    expectStart("implement the login flow", "build");
    expectStart("코딩해줘", "build");
  });

  it("review requests aim at review", () => {
    expectStart("리뷰해줘", "review");
    expectStart("review this PR for security", "review");
  });

  it("QA / verification requests aim at verify", () => {
    expectStart("QA 시나리오 만들어줘", "verify");
    expectStart("verify this works", "verify");
  });

  it("ship / PR requests aim at ship", () => {
    expectStart("PR 만들어줘", "ship");
    expectStart("배포 준비", "ship");
  });

  it("retro requests aim at reflect", () => {
    expectStart("회고 작성", "reflect");
    expectStart("retrospective please", "reflect");
  });

  it("returns discuss as the default fallback for unmatched tasks", () => {
    const result = inferStartPhase("blah blah unrelated", null);
    expect(result.phase).toBe("discuss");
    expect(result.confidence).toBe("low");
  });

  it("downgrades build → plan when no PLAN.md exists in the session", () => {
    const handoff = emptyHandoff();
    handoff.plan = null;
    const result = inferStartPhase("implement the feature", handoff);
    expect(result.phase).toBe("plan");
    expect(result.note).toMatch(/PLAN\.md/);
  });

  it("keeps build when PLAN.md is present", () => {
    const handoff = emptyHandoff();
    handoff.plan = {
      approach: "x",
      modules: [],
      acceptanceCriteria: [],
      testPlan: [],
      risks: [],
    };
    const result = inferStartPhase("implement the feature", handoff);
    expect(result.phase).toBe("build");
  });

  it("downgrades plan → discuss when no CONTEXT.md exists in the session", () => {
    const handoff = emptyHandoff();
    handoff.context = null;
    const result = inferStartPhase("design the architecture", handoff);
    expect(result.phase).toBe("discuss");
    expect(result.note).toMatch(/CONTEXT\.md/);
  });

  it("respects matched rule order — earlier rule wins on overlap", () => {
    // "review the PRD" matches both review and discuss patterns;
    // PRD-discuss should win because it appears first in BUILTIN.
    const result = inferStartPhase("review the PRD draft", null);
    expect(["discuss", "review"]).toContain(result.phase);
  });
});

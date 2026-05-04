import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { getPackageRoot } from "../../src/workspace";
import {
  parsePhaseMatrix,
  loadPhaseMatrix,
  personasForPhase,
  primaryPersonaForPhase,
  BUILTIN_PHASE_MATRIX,
} from "../../src/phases/matrix";
import { LoomPhase } from "../../src/types";

const MATRIX_FILE = path.join(getPackageRoot(), "harness", "phases.md");

describe("phases/matrix — parser", () => {
  it("returns [] for empty markdown", () => {
    expect(parsePhaseMatrix("")).toEqual([]);
  });

  it("parses a single row with primary + secondary personas", () => {
    const md = `
| Phase | Primary | Secondary |
|-------|---------|-----------|
| discuss | ryze | zilean, local-fast |
`;
    const rules = parsePhaseMatrix(md);
    expect(rules).toEqual([
      { phase: "discuss", primary: ["ryze"], secondary: ["zilean", "local-fast"] },
    ]);
  });

  it("parses multiple rows and trims whitespace", () => {
    const md = `
| Phase | Primary | Secondary |
|-------|---------|-----------|
| discuss | ryze | zilean |
|  plan   | ornn, orianna |  hwei  |
| build | viktor | |
`;
    const rules = parsePhaseMatrix(md);
    expect(rules).toEqual([
      { phase: "discuss", primary: ["ryze"], secondary: ["zilean"] },
      { phase: "plan", primary: ["ornn", "orianna"], secondary: ["hwei"] },
      { phase: "build", primary: ["viktor"], secondary: [] },
    ]);
  });

  it("ignores rows with unknown phase names", () => {
    const md = `
| Phase | Primary | Secondary |
|-------|---------|-----------|
| nope | ryze | |
| discuss | ryze | |
`;
    expect(parsePhaseMatrix(md)).toEqual([
      { phase: "discuss", primary: ["ryze"], secondary: [] },
    ]);
  });

  it("ignores rows with empty primary list", () => {
    const md = `
| Phase | Primary | Secondary |
|-------|---------|-----------|
| build | | viktor |
`;
    expect(parsePhaseMatrix(md)).toEqual([]);
  });

  it("skips fenced code blocks", () => {
    const md = `
\`\`\`
| Phase | Primary | Secondary |
| discuss | ryze | |
\`\`\`

| Phase | Primary | Secondary |
|---|---|---|
| plan | ornn | |
`;
    expect(parsePhaseMatrix(md)).toEqual([
      { phase: "plan", primary: ["ornn"], secondary: [] },
    ]);
  });
});

describe("phases/matrix — loader", () => {
  let backedUp: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(MATRIX_FILE)) {
      backedUp = fs.readFileSync(MATRIX_FILE, "utf8");
      fs.rmSync(MATRIX_FILE);
    }
  });

  afterEach(() => {
    if (backedUp !== null) {
      fs.writeFileSync(MATRIX_FILE, backedUp, "utf8");
    } else if (fs.existsSync(MATRIX_FILE)) {
      fs.rmSync(MATRIX_FILE);
    }
    backedUp = null;
  });

  it("falls back to BUILTIN_PHASE_MATRIX when phases.md is absent", () => {
    expect(loadPhaseMatrix()).toEqual(BUILTIN_PHASE_MATRIX);
  });

  it("uses harness/phases.md when present", () => {
    fs.writeFileSync(
      MATRIX_FILE,
      `| Phase | Primary | Secondary |
|---|---|---|
| discuss | ryze | |
`,
      "utf8",
    );
    const rules = loadPhaseMatrix();
    expect(rules).toEqual([
      { phase: "discuss", primary: ["ryze"], secondary: [] },
    ]);
  });
});

describe("phases/matrix — lookup helpers", () => {
  it("personasForPhase returns primary + secondary in order", () => {
    const matrix = [
      { phase: "discuss" as LoomPhase, primary: ["ryze"], secondary: ["zilean"] },
    ];
    expect(personasForPhase(matrix, "discuss")).toEqual(["ryze", "zilean"]);
  });

  it("personasForPhase returns [] for missing phase", () => {
    expect(personasForPhase([], "build")).toEqual([]);
  });

  it("primaryPersonaForPhase returns first primary or null", () => {
    const matrix = [
      {
        phase: "plan" as LoomPhase,
        primary: ["ornn", "orianna"],
        secondary: [],
      },
    ];
    expect(primaryPersonaForPhase(matrix, "plan")).toBe("ornn");
    expect(primaryPersonaForPhase(matrix, "build")).toBeNull();
  });

  it("BUILTIN_PHASE_MATRIX covers every Loom phase", () => {
    const phases = BUILTIN_PHASE_MATRIX.map((r) => r.phase);
    for (const p of [
      "discuss",
      "plan",
      "build",
      "review",
      "verify",
      "ship",
      "reflect",
    ] as LoomPhase[]) {
      expect(phases).toContain(p);
    }
  });

  it("BUILTIN_PHASE_MATRIX every primary persona is non-empty", () => {
    for (const rule of BUILTIN_PHASE_MATRIX) {
      expect(rule.primary.length).toBeGreaterThan(0);
    }
  });
});

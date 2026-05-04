import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withRolePrompt } from "../../src/agents/prompt";
import { clearDefaultsCache } from "../../src/config";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  getPackageRoot,
  setActiveWorkspace,
} from "../../src/workspace";
import { PhaseHandoff } from "../../src/types";

const commonPath = path.join(getPackageRoot(), "harness", "prompts", "_common.md");
let tmp: string;
let originalWorkspace: string;
let backupCommon: string | null = null;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-prompt-phase-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
  clearDefaultsCache();
  backupCommon = fs.existsSync(commonPath)
    ? fs.readFileSync(commonPath, "utf8")
    : null;
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (backupCommon === null) {
    if (fs.existsSync(commonPath)) fs.unlinkSync(commonPath);
  } else {
    fs.writeFileSync(commonPath, backupCommon);
  }
});

function makeHandoff(overrides: Partial<PhaseHandoff> = {}): PhaseHandoff {
  return {
    feature: "demo",
    fromPhase: "discuss",
    toPhase: "plan",
    state: {
      feature: "demo",
      currentPhase: "plan",
      history: ["discuss", "plan"],
      gates: [
        {
          phase: "discuss",
          decision: "proceed",
          at: "2026-05-03T00:00:00.000Z",
        },
      ],
      blockers: [],
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T00:00:00.000Z",
    },
    context: null,
    plan: null,
    priorOutputs: { discuss: "ryze said: scope is locked" },
    ...overrides,
  };
}

describe("withRolePrompt + phase context placeholders", () => {
  it("substitutes ${phase} with options.phase when provided", () => {
    fs.writeFileSync(commonPath, "Phase=${phase}");
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "viktor",
      { phase: "build" },
    );
    expect(result).toContain("Phase=build");
  });

  it("renders ${phase} as 'none' when phase is omitted", () => {
    fs.writeFileSync(commonPath, "Phase=${phase}");
    const result = withRolePrompt("task", {
      description: "x",
      runtime: "codex",
      model: "x",
    }, "viktor");
    expect(result).toContain("Phase=none");
  });

  it("substitutes ${feature} with handoff feature slug", () => {
    fs.writeFileSync(commonPath, "Feature=${feature}");
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "viktor",
      { handoff: makeHandoff({ feature: "add-dark-mode" }) },
    );
    expect(result).toContain("Feature=add-dark-mode");
  });

  it("renders ${feature} as 'standalone' when no handoff", () => {
    fs.writeFileSync(commonPath, "Feature=${feature}");
    const result = withRolePrompt("task", {
      description: "x",
      runtime: "codex",
      model: "x",
    }, "viktor");
    expect(result).toContain("Feature=standalone");
  });

  it("appends a Phase Context block when handoff is provided", () => {
    fs.writeFileSync(commonPath, "BASE");
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "ornn",
      { handoff: makeHandoff() },
    );
    expect(result).toContain("Phase Context");
    expect(result).toContain("Feature: demo");
    expect(result).toContain("Current Phase: plan");
    expect(result).toContain("Previous Phase: discuss");
  });

  it("includes prior phase outputs in the Phase Context block", () => {
    fs.writeFileSync(commonPath, "BASE");
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "ornn",
      { handoff: makeHandoff() },
    );
    expect(result).toContain("ryze said: scope is locked");
  });

  it("does not append Phase Context when no handoff", () => {
    fs.writeFileSync(commonPath, "BASE");
    const result = withRolePrompt("task", {
      description: "x",
      runtime: "codex",
      model: "x",
    }, "ornn");
    expect(result).not.toContain("Phase Context");
  });
});

describe("revise-hint injection (C-2)", () => {
  it("includes the latest revise note for the active phase", () => {
    fs.writeFileSync(commonPath, "BASE");
    const handoff = makeHandoff();
    handoff.state.gates.push({
      phase: "plan",
      decision: "revise",
      at: "2026-05-03T01:00:00.000Z",
      note: "p99 latency budget changed to 200ms; rework cache layer",
    });
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "ornn",
      { handoff },
    );
    expect(result).toContain("Revision Hint");
    expect(result).toContain("p99 latency budget changed to 200ms");
  });

  it("does NOT include the hint after a subsequent proceed gate clears it", () => {
    fs.writeFileSync(commonPath, "BASE");
    const handoff = makeHandoff();
    handoff.state.gates.push(
      {
        phase: "plan",
        decision: "revise",
        at: "2026-05-03T01:00:00.000Z",
        note: "old hint that should be cleared",
      },
      {
        phase: "plan",
        decision: "proceed",
        at: "2026-05-03T02:00:00.000Z",
      },
    );
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "ornn",
      { handoff },
    );
    expect(result).not.toContain("Revision Hint");
    expect(result).not.toContain("old hint that should be cleared");
  });

  it("uses only the LATEST revise note when multiple revises stack", () => {
    fs.writeFileSync(commonPath, "BASE");
    const handoff = makeHandoff();
    handoff.state.gates.push(
      {
        phase: "plan",
        decision: "revise",
        at: "2026-05-03T01:00:00.000Z",
        note: "older note",
      },
      {
        phase: "plan",
        decision: "revise",
        at: "2026-05-03T02:00:00.000Z",
        note: "newer authoritative note",
      },
    );
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "ornn",
      { handoff },
    );
    expect(result).toContain("newer authoritative note");
    expect(result).not.toContain("older note");
  });

  it("ignores revise notes attached to a different phase", () => {
    fs.writeFileSync(commonPath, "BASE");
    const handoff = makeHandoff(); // toPhase=plan
    handoff.state.gates.push({
      phase: "discuss",
      decision: "revise",
      at: "2026-05-03T01:00:00.000Z",
      note: "discuss-only correction",
    });
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "ornn",
      { handoff },
    );
    expect(result).not.toContain("discuss-only correction");
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAgentRun } from "../../src/engine/worker";
import { clearDefaultsCache } from "../../src/config";
import { getActiveWorkspace, setActiveWorkspace } from "../../src/workspace";
import { PhaseHandoff } from "../../src/types";

let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  clearDefaultsCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
});

function makeHandoff(): PhaseHandoff {
  return {
    feature: "demo-feature",
    fromPhase: "discuss",
    toPhase: "plan",
    state: {
      feature: "demo-feature",
      currentPhase: "plan",
      history: ["discuss", "plan"],
      gates: [],
      blockers: [],
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T00:00:00.000Z",
    },
    context: null,
    plan: null,
    priorOutputs: { discuss: "ryze locked the scope" },
  };
}

describe("resolveAgentRun phase context propagation", () => {
  it("backward compatible: works with no phase options", () => {
    const run = resolveAgentRun("twistedfate", "x", {});
    expect(run.prompt).toContain("x");
  });

  it("injects ${phase} placeholder when phase option is given", () => {
    const run = resolveAgentRun("twistedfate", "x", {}, { phase: "build" });
    expect(run.prompt).toContain("build");
  });

  it("injects Phase Context block when handoff option is given", () => {
    const run = resolveAgentRun(
      "twistedfate",
      "x",
      {},
      { handoff: makeHandoff() },
    );
    expect(run.prompt).toContain("Phase Context");
    expect(run.prompt).toContain("Feature: demo-feature");
    expect(run.prompt).toContain("ryze locked the scope");
  });
});

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture";
import { runAutopilot } from "../../src/commands/autopilot";
import { resolvePhaseSession, loadState } from "../../src/phases/session";
import { GateDecision, LoomPhase } from "../../src/types";
import { clearDefaultsCache, saveWorkspaceConfig } from "../../src/config";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-autopilot-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
  clearDefaultsCache();
  saveWorkspaceConfig({
    runtimes: {
      codex: { command: "true", extraArgs: [] },
      claude: { command: "true", extraArgs: [] },
      gemini: { command: "true", extraArgs: [] },
      ollama: { command: "true", extraArgs: [] },
    },
  });
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function gateAlways(decision: GateDecision) {
  return async () => ({ decision });
}

function gateScript(script: GateDecision[]) {
  let i = 0;
  return async () => {
    const next = script[i] ?? "abort";
    i += 1;
    return { decision: next };
  };
}

describe("runAutopilot — argument validation", () => {
  it("requires a task", async () => {
    await expect(
      runAutopilot([], { feature: "x" }, { gateProvider: gateAlways("abort") }),
    ).rejects.toThrow(/Usage:/);
  });

  it("requires --feature", async () => {
    await expect(
      runAutopilot(["plan a thing"], {}, { gateProvider: gateAlways("abort") }),
    ).rejects.toThrow(/feature/i);
  });

  it("rejects unknown --start phase", async () => {
    await expect(
      runAutopilot(
        ["task"],
        { feature: "f", start: "nope" },
        { gateProvider: gateAlways("abort") },
      ),
    ).rejects.toThrow(/unknown phase/i);
  });
});

describe("runAutopilot — start phase decision", () => {
  it("starts at discuss for PRD-style task", async () => {
    let result;
    await captureConsole([], async () => {
      result = await runAutopilot(
        ["PRD for new feature please"],
        { feature: "prd-feature", synthesize: false },
        { gateProvider: gateAlways("abort") },
      );
    });
    expect(result?.phasesRun[0]).toBe("discuss");
  });

  it("--start overrides the inferred phase", async () => {
    let result;
    await captureConsole([], async () => {
      result = await runAutopilot(
        ["something"],
        { feature: "forced", start: "review", synthesize: false },
        { gateProvider: gateAlways("abort") },
      );
    });
    expect(result?.phasesRun[0]).toBe("review");
  });
});

describe("runAutopilot — gate flow", () => {
  it("--non-interactive --gate auto-proceed advances without a gate provider", async () => {
    let result;
    await captureConsole([], async () => {
      result = await runAutopilot(
        ["PRD for thing"],
        {
          feature: "auto-proceed",
          synthesize: false,
          "non-interactive": true,
          gate: "auto-proceed",
          end: "plan",
        },
      );
    });
    expect(result?.phasesRun).toEqual(["discuss", "plan"]);
  });

  it("--non-interactive requires an explicit gate policy", async () => {
    await expect(
      runAutopilot(["PRD for thing"], {
        feature: "non-interactive-no-policy",
        synthesize: false,
        "non-interactive": true,
      }),
    ).rejects.toThrow(/gate policy/i);
  });

  it("'proceed' gate advances to the next phase in sequence", async () => {
    let result;
    await captureConsole([], async () => {
      result = await runAutopilot(
        ["PRD for thing"],
        { feature: "advance", synthesize: false },
        { gateProvider: gateScript(["proceed", "abort"]) },
      );
    });
    expect(result?.phasesRun).toEqual(["discuss", "plan"]);
  });

  it("'revise' gate re-runs the same phase", async () => {
    let result;
    await captureConsole([], async () => {
      result = await runAutopilot(
        ["PRD for thing"],
        { feature: "revise", synthesize: false },
        { gateProvider: gateScript(["revise", "abort"]) },
      );
    });
    expect(result?.phasesRun).toEqual(["discuss", "discuss"]);
  });

  it("'abort' gate stops the autopilot loop immediately", async () => {
    let result;
    await captureConsole([], async () => {
      result = await runAutopilot(
        ["PRD"],
        { feature: "abort", synthesize: false },
        { gateProvider: gateAlways("abort") },
      );
    });
    expect(result?.phasesRun).toEqual(["discuss"]);
  });

  it("loop terminates after reflect even without abort", async () => {
    let result;
    await captureConsole([], async () => {
      result = await runAutopilot(
        ["회고 작성"],
        { feature: "reflectonly", synthesize: false },
        { gateProvider: gateAlways("proceed") },
      );
    });
    expect(result?.phasesRun).toEqual(["reflect"]);
  });

  it("--end limits the loop", async () => {
    let result;
    await captureConsole([], async () => {
      result = await runAutopilot(
        ["PRD"],
        { feature: "endat", end: "plan", synthesize: false },
        { gateProvider: gateAlways("proceed") },
      );
    });
    expect(result?.phasesRun).toEqual(["discuss", "plan"]);
  });
});

describe("runAutopilot — STATE persistence", () => {
  it("records gate decisions in STATE.md", async () => {
    await captureConsole([], async () => {
      await runAutopilot(
        ["PRD"],
        { feature: "stateft", synthesize: false },
        { gateProvider: gateScript(["proceed", "abort"]) },
      );
    });
    const dir = resolvePhaseSession("stateft") as string;
    const state = loadState(dir);
    expect(state.gates.length).toBe(2);
    expect(state.gates.map((g) => g.decision)).toEqual(["proceed", "abort"]);
  });
});

describe("runAutopilot — covers all 7 phases when proceeding through", () => {
  it("walks discuss → plan → build → review → verify → ship → reflect", async () => {
    let result;
    await captureConsole([], async () => {
      result = await runAutopilot(
        ["PRD for kitchen-sink feature"],
        { feature: "fullwalk", synthesize: false },
        { gateProvider: gateAlways("proceed") },
      );
    });
    const expected: LoomPhase[] = [
      "discuss",
      "plan",
      "build",
      "review",
      "verify",
      "ship",
      "reflect",
    ];
    expect(result?.phasesRun).toEqual(expected);
  });
});

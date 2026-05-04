import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture";
import { runPhase } from "../../src/phases/runner";
import {
  createPhaseSession,
  loadState,
  appendWorkerOutput,
} from "../../src/phases/session";
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-phase-runner-"));
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

describe("runPhase", () => {
  it("rejects an unknown phase name", async () => {
    const dir = createPhaseSession("foo");
    await expect(
      runPhase(dir, "nonsense" as never, {
        task: "x",
        flags: {},
        synthesize: false,
      }),
    ).rejects.toThrow(/unknown phase/i);
  });

  it("uses primary personas from the matrix when personas are not overridden", async () => {
    const dir = createPhaseSession("foo");
    let result;
    await captureConsole([], async () => {
      result = await runPhase(dir, "discuss", {
        task: "design X",
        flags: {},
        synthesize: false,
      });
    });
    expect(result?.workers.map((w) => w.agentName)).toEqual(["ryze"]);
  });

  it("respects an explicit personas override", async () => {
    const dir = createPhaseSession("foo");
    let result;
    await captureConsole([], async () => {
      result = await runPhase(dir, "discuss", {
        task: "x",
        flags: {},
        personas: ["zilean"],
        synthesize: false,
      });
    });
    expect(result?.workers.map((w) => w.agentName)).toEqual(["zilean"]);
  });

  it("appends each worker output to workers/<phase>/<persona>.md", async () => {
    const dir = createPhaseSession("foo");
    await captureConsole([], async () => {
      await runPhase(dir, "discuss", {
        task: "x",
        flags: {},
        synthesize: false,
      });
    });
    const file = path.join(dir, "workers", "discuss", "ryze.md");
    expect(fs.existsSync(file)).toBe(true);
  });

  it("updates STATE.md currentPhase + appends history when entering a new phase", async () => {
    const dir = createPhaseSession("foo");
    await captureConsole([], async () => {
      await runPhase(dir, "plan", {
        task: "x",
        flags: {},
        synthesize: false,
      });
    });
    const state = loadState(dir);
    expect(state.currentPhase).toBe("plan");
    expect(state.history).toEqual(["discuss", "plan"]);
  });

  it("does not duplicate history when re-running the current phase", async () => {
    const dir = createPhaseSession("foo");
    await captureConsole([], async () => {
      await runPhase(dir, "discuss", {
        task: "x",
        flags: {},
        synthesize: false,
      });
      await runPhase(dir, "discuss", {
        task: "y",
        flags: {},
        synthesize: false,
      });
    });
    expect(loadState(dir).history).toEqual(["discuss"]);
  });

  it("writes synthesis.md when synthesize=true", async () => {
    const dir = createPhaseSession("foo");
    await captureConsole([], async () => {
      await runPhase(dir, "discuss", {
        task: "x",
        flags: {},
        synthesize: true,
      });
    });
    expect(fs.existsSync(path.join(dir, "workers", "discuss", "synthesis.md"))).toBe(
      true,
    );
  });

  it("returns a stateAfter snapshot reflecting the just-run phase", async () => {
    const dir = createPhaseSession("foo");
    let result;
    await captureConsole([], async () => {
      result = await runPhase(dir, "plan", {
        task: "x",
        flags: {},
        synthesize: false,
      });
    });
    expect(result?.stateAfter.currentPhase).toBe("plan");
    expect(result?.stateAfter.history).toContain("plan");
  });

  it("makes prior phase outputs available to subsequent phase workers", async () => {
    const dir = createPhaseSession("foo");
    appendWorkerOutput(dir, "discuss", "ryze", "FIRST_PHASE_MARKER");
    let result;
    await captureConsole([], async () => {
      result = await runPhase(dir, "plan", {
        task: "x",
        flags: {},
        synthesize: false,
      });
    });
    const ornnPrompt = result?.workers.find((w) => w.agentName === "ornn")?.prompt;
    expect(ornnPrompt).toContain("FIRST_PHASE_MARKER");
  });

  it("dry-run mode does not spawn workers and does not advance STATE", async () => {
    const dir = createPhaseSession("foo");
    let result;
    await captureConsole([], async () => {
      result = await runPhase(dir, "plan", {
        task: "x",
        flags: { "dry-run": true },
        synthesize: false,
      });
    });
    expect(result?.workers).toEqual([]);
    expect(loadState(dir).currentPhase).toBe("discuss");
  });
});

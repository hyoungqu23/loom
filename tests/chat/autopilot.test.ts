import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveWorkspaceConfig, clearDefaultsCache } from "../../src/config.js";
import {
  ChatState,
  chatReducer,
  createInitialChatState,
} from "../../src/chat/state.js";
import { executeChatCommand } from "../../src/chat/runtime.js";
import {
  isAutopilotEnd,
  nextLoomPhase,
} from "../../src/chat/autopilot.js";
import {
  createPhaseSession,
  loadState,
} from "../../src/phases/session.js";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace.js";
import { captureConsole } from "../../src/util/capture.js";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-chat-autopilot-"));
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

function buildState(feature: string): ChatState {
  const sessionDir = createPhaseSession(feature);
  let state = createInitialChatState({
    sessionDir,
    feature,
    currentPhase: "discuss",
  });
  state = chatReducer(state, { type: "set-synthesize", enabled: false });
  return state;
}

describe("chat/autopilot helpers", () => {
  it("nextLoomPhase advances and stops at reflect", () => {
    expect(nextLoomPhase("discuss")).toBe("plan");
    expect(nextLoomPhase("ship")).toBe("reflect");
    expect(nextLoomPhase("reflect")).toBe(null);
  });

  it("isAutopilotEnd respects the configured end phase", () => {
    expect(isAutopilotEnd("plan", "plan")).toBe(true);
    expect(isAutopilotEnd("plan", "reflect")).toBe(false);
    expect(isAutopilotEnd("reflect", "reflect")).toBe(true);
  });
});

describe("chat/autopilot loop", () => {
  it("starts autopilot and waits for a chat gate after the first phase", async () => {
    const state = buildState("autopilot start");

    let result;
    await captureConsole([], async () => {
      result = await executeChatCommand(state, {
        type: "autopilot",
        task: "ship a hotfix",
      });
    });

    expect(result?.state.autopilot).toEqual({
      task: "ship a hotfix",
      endPhase: "reflect",
    });
    expect(result?.state.run).toEqual({
      status: "waiting-for-gate",
      phase: "discuss",
    });
    const types = result?.messages.map((m) => m.type) ?? [];
    expect(types[0]).toBe("autopilot-start");
    expect(types).toContain("run-start");
    expect(types).toContain("run-finish");
    expect(types[types.length - 1]).toBe("gate-wait");
  });

  it("advances to the next phase after /gate proceed inside autopilot", async () => {
    let state = buildState("autopilot proceed");

    await captureConsole([], async () => {
      const start = await executeChatCommand(state, {
        type: "autopilot",
        task: "do the thing",
      });
      state = start.state;
    });
    expect(state.run).toEqual({ status: "waiting-for-gate", phase: "discuss" });

    let proceedResult;
    await captureConsole([], async () => {
      proceedResult = await executeChatCommand(state, {
        type: "gate",
        decision: "proceed",
        note: "",
      });
    });

    expect(proceedResult?.state.run).toEqual({
      status: "waiting-for-gate",
      phase: "plan",
    });
    expect(proceedResult?.state.autopilot).not.toBe(null);
    expect(proceedResult?.phaseResult?.phase).toBe("plan");
    const gates = loadState(state.sessionDir).gates;
    expect(gates[gates.length - 1]).toMatchObject({
      phase: "discuss",
      decision: "proceed",
    });
  });

  it("re-runs the same phase after /gate revise inside autopilot", async () => {
    let state = buildState("autopilot revise");

    await captureConsole([], async () => {
      const start = await executeChatCommand(state, {
        type: "autopilot",
        task: "draft an idea",
      });
      state = start.state;
    });

    let reviseResult;
    await captureConsole([], async () => {
      reviseResult = await executeChatCommand(state, {
        type: "gate",
        decision: "revise",
        note: "tighten the scope",
      });
    });

    expect(reviseResult?.state.run).toEqual({
      status: "waiting-for-gate",
      phase: "discuss",
    });
    expect(reviseResult?.phaseResult?.phase).toBe("discuss");
    const gates = loadState(state.sessionDir).gates;
    expect(gates[gates.length - 1]).toMatchObject({
      phase: "discuss",
      decision: "revise",
      note: "tighten the scope",
    });
  });

  it("stops the loop on /gate abort and returns to idle", async () => {
    let state = buildState("autopilot abort");

    await captureConsole([], async () => {
      const start = await executeChatCommand(state, {
        type: "autopilot",
        task: "experimental",
      });
      state = start.state;
    });

    let abortResult;
    await captureConsole([], async () => {
      abortResult = await executeChatCommand(state, {
        type: "gate",
        decision: "abort",
        note: "",
      });
    });

    expect(abortResult?.state.autopilot).toBe(null);
    expect(abortResult?.state.run).toEqual({ status: "idle" });
    const messageTypes = abortResult?.messages.map((m) => m.type) ?? [];
    expect(messageTypes).toContain("gate-recorded");
    expect(messageTypes).toContain("autopilot-stop");
  });

  it("rejects /phase while autopilot is running", async () => {
    let state = buildState("autopilot phase guard");

    await captureConsole([], async () => {
      const start = await executeChatCommand(state, {
        type: "autopilot",
        task: "ship it",
      });
      state = start.state;
    });
    expect(state.autopilot).not.toBe(null);

    const result = await executeChatCommand(state, {
      type: "phase",
      phase: "build",
      task: "side jump",
    });

    expect(result.state).toBe(state);
    expect(result.messages).toEqual([
      expect.objectContaining({
        type: "error",
        text: expect.stringContaining("autopilot is running"),
      }),
    ]);
    // The autopilot loop should still be parked on the same phase
    // it landed on at /autopilot start (discuss).
    expect(result.state.run).toEqual({
      status: "waiting-for-gate",
      phase: "discuss",
    });
  });

  it("rejects /autopilot when --end comes before --start in phase order", async () => {
    const state = buildState("autopilot inverted");

    const result = await executeChatCommand(state, {
      type: "autopilot",
      task: "broken scope",
      startPhase: "build",
      endPhase: "discuss",
    });

    expect(result.state).toBe(state);
    expect(result.state.autopilot).toBe(null);
    expect(result.messages).toEqual([
      expect.objectContaining({
        type: "error",
        text: expect.stringContaining(
          "autopilot end phase discuss comes before start phase build",
        ),
      }),
    ]);
  });

  it("rejects /autopilot when an inferred start outruns an explicit --end", async () => {
    // currentPhase is plan, no --start override → inferAutopilotStartPhase
    // refuses to regress and returns plan. --end discuss is earlier.
    const sessionDir = createPhaseSession("autopilot inferred outruns end");
    let state = createInitialChatState({
      sessionDir,
      feature: "autopilot-inferred-outruns-end",
      currentPhase: "plan",
    });
    state = chatReducer(state, { type: "set-synthesize", enabled: false });

    const result = await executeChatCommand(state, {
      type: "autopilot",
      task: "this should fail",
      endPhase: "discuss",
    });

    expect(result.state.autopilot).toBe(null);
    expect(result.messages[0]).toMatchObject({
      type: "error",
      text: expect.stringContaining("comes before start phase plan"),
    });
  });

  it("rejects /autopilot when one is already in flight", async () => {
    let state = buildState("autopilot conflict");

    await captureConsole([], async () => {
      const start = await executeChatCommand(state, {
        type: "autopilot",
        task: "first task",
      });
      state = start.state;
    });

    const result = await executeChatCommand(state, {
      type: "autopilot",
      task: "second task",
    });

    expect(result.state).toBe(state);
    expect(result.messages).toEqual([
      {
        type: "error",
        text: "autopilot already running; /gate abort to stop first",
      },
    ]);
  });

  it("honours --start and --end overrides on /autopilot", async () => {
    let state = buildState("autopilot start end");

    await captureConsole([], async () => {
      const start = await executeChatCommand(state, {
        type: "autopilot",
        task: "tight scope",
        startPhase: "build",
        endPhase: "build",
      });
      state = start.state;
    });

    // First phase ran at build (not the inferred default).
    expect(state.run).toEqual({
      status: "waiting-for-gate",
      phase: "build",
    });

    let proceedResult;
    await captureConsole([], async () => {
      proceedResult = await executeChatCommand(state, {
        type: "gate",
        decision: "proceed",
        note: "",
      });
    });

    // /gate proceed at the configured end phase stops the loop
    // immediately instead of advancing into review.
    expect(proceedResult?.state.autopilot).toBe(null);
    expect(proceedResult?.state.run).toEqual({ status: "idle" });
    const stop = proceedResult?.messages.find(
      (m) => m.type === "autopilot-stop",
    );
    expect(stop?.text).toContain("autopilot complete");
  });

  it("stops autopilot once the end phase finishes with proceed", async () => {
    const sessionDir = createPhaseSession("autopilot end");
    let state = createInitialChatState({
      sessionDir,
      feature: "autopilot-end",
      currentPhase: "reflect",
    });
    state = chatReducer(state, { type: "set-synthesize", enabled: false });

    await captureConsole([], async () => {
      const start = await executeChatCommand(state, {
        type: "autopilot",
        task: "wrap up",
      });
      state = start.state;
    });
    expect(state.run).toEqual({
      status: "waiting-for-gate",
      phase: "reflect",
    });

    let proceedResult;
    await captureConsole([], async () => {
      proceedResult = await executeChatCommand(state, {
        type: "gate",
        decision: "proceed",
        note: "",
      });
    });

    expect(proceedResult?.state.autopilot).toBe(null);
    expect(proceedResult?.state.run).toEqual({ status: "idle" });
    const stop = proceedResult?.messages.find(
      (m) => m.type === "autopilot-stop",
    );
    expect(stop?.text).toContain("autopilot complete");
  });

  it("leaves /gate untouched when no autopilot is running", async () => {
    const state = buildState("autopilot off");

    const result = await executeChatCommand(state, {
      type: "gate",
      decision: "proceed",
      note: "",
    });

    expect(result.state).toBe(state);
    expect(result.messages.map((m) => m.type)).toEqual(["gate-recorded"]);
  });
});

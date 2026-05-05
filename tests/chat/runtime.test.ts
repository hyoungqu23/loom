import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { saveWorkspaceConfig, clearDefaultsCache } from "../../src/config";
import { createInitialChatState, chatReducer } from "../../src/chat/state";
import { executeChatCommand } from "../../src/chat/runtime";
import {
  createPhaseSession,
  loadState,
} from "../../src/phases/session";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";
import { captureConsole } from "../../src/util/capture";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-chat-runtime-"));
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

describe("chat/runtime", () => {
  it("runs a single phase and returns to idle without waiting for a gate", async () => {
    const sessionDir = createPhaseSession("chat phase");
    let state = createInitialChatState({
      sessionDir,
      feature: "chat-phase",
      currentPhase: "discuss",
    });
    state = chatReducer(state, { type: "set-synthesize", enabled: false });

    let result;
    await captureConsole([], async () => {
      result = await executeChatCommand(state, {
        type: "phase",
        phase: "discuss",
        task: "clarify scope",
      });
    });

    expect(result?.state.run).toEqual({ status: "idle" });
    expect(result?.state.currentPhase).toBe("discuss");
    expect(result?.messages.map((m) => m.type)).toEqual([
      "run-start",
      "run-finish",
    ]);
    expect(result?.phaseResult?.workers.map((w) => w.agentName)).toEqual([
      "ryze",
    ]);
    expect(fs.existsSync(path.join(sessionDir, "workers", "discuss", "ryze.md"))).toBe(
      true,
    );
    expect(loadState(sessionDir).gates).toEqual([]);
  });

  it("passes secondary and persona options through to phase runs", async () => {
    const sessionDir = createPhaseSession("chat options");
    let state = createInitialChatState({
      sessionDir,
      feature: "chat-options",
      currentPhase: "discuss",
    });
    state = chatReducer(state, { type: "set-secondary", enabled: true });
    state = chatReducer(state, { type: "set-personas", personas: ["zilean"] });
    state = chatReducer(state, { type: "set-synthesize", enabled: false });

    let result;
    await captureConsole([], async () => {
      result = await executeChatCommand(state, {
        type: "phase",
        phase: "discuss",
        task: "clarify scope",
      });
    });

    expect(result?.phaseResult?.workers.map((w) => w.agentName)).toEqual([
      "zilean",
    ]);
  });

  it("records explicit gate decisions without running workers", async () => {
    const sessionDir = createPhaseSession("chat gate");
    const state = createInitialChatState({
      sessionDir,
      feature: "chat-gate",
      currentPhase: "plan",
    });

    const result = await executeChatCommand(state, {
      type: "gate",
      decision: "revise",
      note: "tighten tests",
    });

    expect(result.state.run).toEqual({ status: "idle" });
    expect(result.messages).toEqual([
      {
        type: "gate-recorded",
        text: "gate recorded: plan -> revise - tighten tests",
      },
    ]);
    expect(loadState(sessionDir).gates[0]).toMatchObject({
      phase: "plan",
      decision: "revise",
      note: "tighten tests",
    });
  });

  it("applies option commands to future runtime state", async () => {
    const sessionDir = createPhaseSession("chat runtime options");
    let state = createInitialChatState({
      sessionDir,
      feature: "chat-runtime-options",
      currentPhase: "discuss",
    });

    let result = await executeChatCommand(state, {
      type: "secondary",
      enabled: true,
    });
    state = result.state;
    result = await executeChatCommand(state, {
      type: "synthesize",
      enabled: false,
    });
    state = result.state;
    result = await executeChatCommand(state, {
      type: "personas",
      personas: ["zilean"],
    });

    expect(result.state.options).toEqual({
      includeSecondary: true,
      synthesize: false,
      personas: ["zilean"],
    });
    expect(result.messages.map((m) => m.text)).toEqual([
      "personas set: zilean",
    ]);
  });

  it("returns a status message without mutating state", async () => {
    const sessionDir = createPhaseSession("chat status");
    const state = createInitialChatState({
      sessionDir,
      feature: "chat-status",
      currentPhase: "build",
      hasContext: true,
    });

    const result = await executeChatCommand(state, { type: "status" });

    expect(result.state).toBe(state);
    expect(result.messages[0]).toEqual({
      type: "status",
      text: expect.stringContaining("feature=chat-status"),
    });
    expect(result.messages[0].text).toContain("phase=build");
  });

  it("emits live worker and synthesis progress messages during a phase run", async () => {
    const sessionDir = createPhaseSession("chat progress");
    const state = createInitialChatState({
      sessionDir,
      feature: "chat-progress",
      currentPhase: "discuss",
    });
    const progress: string[] = [];

    await captureConsole([], async () => {
      await executeChatCommand(
        state,
        {
          type: "phase",
          phase: "discuss",
          task: "clarify scope",
        },
        {
          onMessage: (message) => {
            progress.push(`${message.type}:${message.text}`);
          },
        },
      );
    });

    expect(progress).toContain("worker-start:worker started: ryze");
    expect(progress).toContain("worker-done:worker finished: ryze status=0");
    expect(progress).toContain(
      "synthesis-start:synthesis started: twistedfate",
    );
    expect(progress).toContain("run-finish:phase finished: discuss workers=1");
  });
});

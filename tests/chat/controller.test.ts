import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { clearDefaultsCache, saveWorkspaceConfig } from "../../src/config.js";
import { handleChatInput } from "../../src/chat/controller.js";
import { createInitialChatState } from "../../src/chat/state.js";
import { createPhaseSession } from "../../src/phases/session.js";
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-chat-controller-"));
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

describe("chat/controller", () => {
  it("records malformed commands as transcript errors without changing state", async () => {
    const sessionDir = createPhaseSession("controller");
    const state = createInitialChatState({
      sessionDir,
      feature: "controller",
      currentPhase: "discuss",
    });

    const result = await handleChatInput(state, [], "/wat");

    expect(result.state).toBe(state);
    expect(result.transcript).toEqual([
      { type: "error", text: "unknown command: wat" },
    ]);
  });

  it("records plain input without executing a runtime command", async () => {
    const sessionDir = createPhaseSession("plain");
    const state = createInitialChatState({
      sessionDir,
      feature: "plain",
      currentPhase: "discuss",
    });

    const result = await handleChatInput(state, [], "please clarify scope");

    expect(result.state).toBe(state);
    expect(result.transcript).toEqual([
      { type: "user", text: "please clarify scope" },
    ]);
  });

  it("appends user input and runtime lifecycle messages for phase commands", async () => {
    const sessionDir = createPhaseSession("phase command");
    const state = createInitialChatState({
      sessionDir,
      feature: "phase-command",
      currentPhase: "discuss",
    });

    let result;
    await captureConsole([], async () => {
      result = await handleChatInput(
        state,
        [],
        "/phase discuss clarify scope",
      );
    });

    expect(result?.state.run).toEqual({ status: "idle" });
    expect(result?.transcript.map((message) => message.type)).toEqual([
      "user",
      "system",
      "system",
    ]);
    expect(result?.transcript[0].text).toBe("/phase discuss clarify scope");
    expect(result?.transcript[1].text).toBe("phase started: discuss");
    expect(result?.transcript[2].text).toContain("phase finished: discuss");
  });

  it("converts thrown runtime errors into transcript error messages without losing state", async () => {
    const sessionDir = createPhaseSession("controller error");
    const validState = createInitialChatState({
      sessionDir,
      feature: "controller-error",
      currentPhase: "discuss",
    });
    // recordPhaseGate calls loadState which throws when STATE.md is
    // missing — pointing the chat state at a bogus path is the most
    // direct way to simulate a runtime failure surfacing through
    // executeChatCommand.
    const brokenState = { ...validState, sessionDir: "/nonexistent/loom-path" };

    const result = await handleChatInput(brokenState, [], "/gate proceed");

    // State is preserved on error so the user can retry.
    expect(result.state).toBe(brokenState);
    expect(result.transcript).toEqual([
      { type: "user", text: "/gate proceed" },
      expect.objectContaining({
        type: "error",
        text: expect.stringContaining("chat error:"),
      }),
    ]);
  });

  it("reports live progress transcript updates while a phase command runs", async () => {
    const sessionDir = createPhaseSession("progress command");
    const state = createInitialChatState({
      sessionDir,
      feature: "progress-command",
      currentPhase: "discuss",
    });
    const live: string[] = [];

    await captureConsole([], async () => {
      await handleChatInput(state, [], "/phase discuss clarify scope", {
        onTranscript: (transcript) => {
          live.push(transcript[transcript.length - 1]?.text || "");
        },
      });
    });

    expect(live).toContain("worker started: ryze");
    expect(live).toContain("worker finished: ryze status=0");
    expect(live).toContain("synthesis started: twistedfate");
    expect(live).toContain("phase finished: discuss workers=1");
  });
});

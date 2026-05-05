import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { clearDefaultsCache, saveWorkspaceConfig } from "../../src/config.js";
import { handleChatInput } from "../../src/chat/controller.js";
import { createInitialChatState } from "../../src/chat/state.js";
import { ChatSnapshot } from "../../src/chat/transcript.js";
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

function snap(sessionDir: string, feature: string): ChatSnapshot {
  return {
    state: createInitialChatState({
      sessionDir,
      feature,
      currentPhase: "discuss",
    }),
    transcript: [],
    detail: "",
  };
}

describe("chat/controller", () => {
  it("records malformed commands as transcript errors without changing state", async () => {
    const sessionDir = createPhaseSession("controller");
    const snapshot = snap(sessionDir, "controller");

    const result = await handleChatInput(snapshot, "/wat");

    expect(result.state).toBe(snapshot.state);
    expect(result.transcript).toEqual([
      { type: "error", text: "unknown command: wat" },
    ]);
  });

  it("records plain input without executing a runtime command", async () => {
    const sessionDir = createPhaseSession("plain");
    const snapshot = snap(sessionDir, "plain");

    const result = await handleChatInput(snapshot, "please clarify scope");

    expect(result.state).toBe(snapshot.state);
    expect(result.transcript).toEqual([
      { type: "user", text: "please clarify scope" },
    ]);
  });

  it("appends user input and runtime lifecycle messages for phase commands", async () => {
    const sessionDir = createPhaseSession("phase command");
    const snapshot = snap(sessionDir, "phase-command");

    let result;
    await captureConsole([], async () => {
      result = await handleChatInput(snapshot, "/phase discuss clarify scope");
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
    const validSnapshot = snap(sessionDir, "controller-error");
    // recordPhaseGate calls loadState which throws when STATE.md is
    // missing — pointing the chat state at a bogus path is the most
    // direct way to simulate a runtime failure surfacing through
    // executeChatCommand.
    const brokenSnapshot: ChatSnapshot = {
      ...validSnapshot,
      state: { ...validSnapshot.state, sessionDir: "/nonexistent/loom-path" },
    };

    const result = await handleChatInput(brokenSnapshot, "/gate proceed");

    // State is preserved on error so the user can retry.
    expect(result.state).toBe(brokenSnapshot.state);
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
    const snapshot = snap(sessionDir, "progress-command");
    const live: string[] = [];

    await captureConsole([], async () => {
      await handleChatInput(snapshot, "/phase discuss clarify scope", {
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

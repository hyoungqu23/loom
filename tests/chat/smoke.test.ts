import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveWorkspaceConfig, clearDefaultsCache } from "../../src/config.js";
import { handleChatInput } from "../../src/chat/controller.js";
import {
  ChatState,
  chatReducer,
  createInitialChatState,
} from "../../src/chat/state.js";
import { Transcript } from "../../src/chat/transcript.js";
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-chat-smoke-"));
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

async function feed(
  state: ChatState,
  transcript: Transcript,
  input: string,
): Promise<{ state: ChatState; transcript: Transcript }> {
  let result;
  await captureConsole([], async () => {
    result = await handleChatInput(state, transcript, input);
  });
  return { state: result!.state, transcript: result!.transcript };
}

describe("chat end-to-end smoke", () => {
  it("walks /phase + manual /gate + /autopilot + /gate proceed/abort against a real session", async () => {
    const sessionDir = createPhaseSession("smoke run");
    let state = createInitialChatState({
      sessionDir,
      feature: "smoke-run",
      currentPhase: "discuss",
    });
    state = chatReducer(state, { type: "set-synthesize", enabled: false });
    let transcript: Transcript = [];

    // 1. Single phase, no auto-gate.
    ({ state, transcript } = await feed(
      state,
      transcript,
      "/phase discuss clarify scope",
    ));
    expect(state.run).toEqual({ status: "idle" });
    expect(state.autopilot).toBe(null);
    expect(transcript.some((m) => m.text.includes("phase finished: discuss"))).toBe(
      true,
    );

    // The detail panel should have updated to reflect discuss.
    expect(state.detail).toContain("discuss");

    // 2. Manual gate on the completed phase.
    ({ state, transcript } = await feed(state, transcript, "/gate proceed"));
    expect(transcript.some((m) => m.text.startsWith("gate recorded: discuss -> proceed"))).toBe(
      true,
    );

    // 3. Start autopilot — first phase runs and we land in waiting-for-gate.
    ({ state, transcript } = await feed(
      state,
      transcript,
      "/autopilot ship the feature",
    ));
    expect(state.autopilot).not.toBe(null);
    expect(state.run).toEqual({
      status: "waiting-for-gate",
      phase: "discuss",
    });

    // 4. /gate proceed advances autopilot to the next phase.
    ({ state, transcript } = await feed(state, transcript, "/gate proceed"));
    expect(state.run).toEqual({
      status: "waiting-for-gate",
      phase: "plan",
    });

    // 5. /gate abort stops autopilot and leaves the user at the input line.
    ({ state, transcript } = await feed(state, transcript, "/gate abort"));
    expect(state.autopilot).toBe(null);
    expect(transcript.some((m) => m.text === "autopilot aborted")).toBe(true);

    // STATE.md should now carry every gate decision in order.
    const persisted = loadState(sessionDir);
    const decisions = persisted.gates.map((g) => g.decision);
    expect(decisions).toEqual(["proceed", "proceed", "abort"]);
  });

  it("recovers from a runtime failure mid-session and keeps the transcript live", async () => {
    const sessionDir = createPhaseSession("smoke recovery");
    let state = createInitialChatState({
      sessionDir,
      feature: "smoke-recovery",
      currentPhase: "discuss",
    });
    let transcript: Transcript = [];

    // /gate against a bogus sessionDir → the controller's catch
    // converts the thrown error into a transcript entry.
    const broken = { ...state, sessionDir: "/nonexistent/loom-smoke" };
    let bad;
    await captureConsole([], async () => {
      bad = await handleChatInput(broken, transcript, "/gate proceed");
    });
    transcript = bad!.transcript;
    expect(bad!.state).toBe(broken);
    expect(transcript.some((m) => m.type === "error")).toBe(true);

    // The original good state still works for the next command.
    ({ state, transcript } = await feed(state, transcript, "/status"));
    expect(transcript.some((m) => m.text.includes("feature=smoke-recovery"))).toBe(
      true,
    );
  });
});

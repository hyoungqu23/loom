import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveWorkspaceConfig, clearDefaultsCache } from "../../src/config.js";
import { handleChatInput } from "../../src/chat/controller.js";
import {
  chatReducer,
  createInitialChatState,
} from "../../src/chat/state.js";
import { ChatSnapshot } from "../../src/chat/transcript.js";
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
  snapshot: ChatSnapshot,
  input: string,
): Promise<ChatSnapshot> {
  let result: ChatSnapshot | undefined;
  await captureConsole([], async () => {
    result = await handleChatInput(snapshot, input);
  });
  return result!;
}

describe("chat end-to-end smoke", () => {
  it("walks /phase + manual /gate + /autopilot + /gate proceed/abort against a real session", async () => {
    const sessionDir = createPhaseSession("smoke run");
    let snapshot: ChatSnapshot = {
      state: chatReducer(
        createInitialChatState({
          sessionDir,
          feature: "smoke-run",
          currentPhase: "discuss",
        }),
        { type: "set-synthesize", enabled: false },
      ),
      transcript: [],
      detail: "",
    };

    // 1. Single phase, no auto-gate.
    snapshot = await feed(snapshot, "/phase discuss clarify scope");
    expect(snapshot.state.run).toEqual({ status: "idle" });
    expect(snapshot.state.autopilot).toBe(null);
    expect(
      snapshot.transcript.some((m) =>
        m.text.includes("phase finished: discuss"),
      ),
    ).toBe(true);

    // The detail panel should have updated to reflect discuss.
    expect(snapshot.detail).toContain("discuss");

    // 2. Manual gate on the completed phase.
    snapshot = await feed(snapshot, "/gate proceed");
    expect(
      snapshot.transcript.some((m) =>
        m.text.startsWith("gate recorded: discuss -> proceed"),
      ),
    ).toBe(true);

    // 3. Start autopilot — first phase runs and we land in waiting-for-gate.
    snapshot = await feed(snapshot, "/autopilot ship the feature");
    expect(snapshot.state.autopilot).not.toBe(null);
    expect(snapshot.state.run).toEqual({
      status: "waiting-for-gate",
      phase: "discuss",
    });

    // 4. /gate proceed advances autopilot to the next phase.
    snapshot = await feed(snapshot, "/gate proceed");
    expect(snapshot.state.run).toEqual({
      status: "waiting-for-gate",
      phase: "plan",
    });

    // 5. /gate abort stops autopilot and leaves the user at the input line.
    snapshot = await feed(snapshot, "/gate abort");
    expect(snapshot.state.autopilot).toBe(null);
    expect(
      snapshot.transcript.some((m) => m.text === "autopilot aborted"),
    ).toBe(true);

    // STATE.md should now carry every gate decision in order.
    const persisted = loadState(sessionDir);
    const decisions = persisted.gates.map((g) => g.decision);
    expect(decisions).toEqual(["proceed", "proceed", "abort"]);
  });

  it("recovers from a runtime failure mid-session and keeps the transcript live", async () => {
    const sessionDir = createPhaseSession("smoke recovery");
    const goodSnapshot: ChatSnapshot = {
      state: createInitialChatState({
        sessionDir,
        feature: "smoke-recovery",
        currentPhase: "discuss",
      }),
      transcript: [],
      detail: "",
    };

    // /gate against a bogus sessionDir → the controller's catch
    // converts the thrown error into a transcript entry.
    const brokenSnapshot: ChatSnapshot = {
      ...goodSnapshot,
      state: { ...goodSnapshot.state, sessionDir: "/nonexistent/loom-smoke" },
    };
    let bad: ChatSnapshot | undefined;
    await captureConsole([], async () => {
      bad = await handleChatInput(brokenSnapshot, "/gate proceed");
    });
    expect(bad!.state).toBe(brokenSnapshot.state);
    expect(bad!.transcript.some((m) => m.type === "error")).toBe(true);

    // The original good state still works for the next command.
    const recovered = await feed(goodSnapshot, "/status");
    expect(
      recovered.transcript.some((m) =>
        m.text.includes("feature=smoke-recovery"),
      ),
    ).toBe(true);
  });
});

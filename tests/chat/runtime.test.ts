import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { saveWorkspaceConfig, clearDefaultsCache } from "../../src/config.js";
import { createInitialChatState, chatReducer } from "../../src/chat/state.js";
import { executeChatCommand } from "../../src/chat/runtime.js";
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

  it("/gate uses an explicit phase argument when provided, overriding currentPhase", async () => {
    const sessionDir = createPhaseSession("chat gate explicit");
    const state = createInitialChatState({
      sessionDir,
      feature: "chat-gate-explicit",
      currentPhase: "build", // memory snapshot says we're at build
    });

    const result = await executeChatCommand(state, {
      type: "gate",
      decision: "proceed",
      phase: "plan",
      note: "ratified offline",
    });

    expect(result.messages[0]).toMatchObject({
      type: "gate-recorded",
      text: "gate recorded: plan -> proceed - ratified offline",
    });
    expect(loadState(sessionDir).gates[0]).toMatchObject({
      phase: "plan",
      decision: "proceed",
      note: "ratified offline",
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

  it("/personas with no list clears the override and reports a reset message", async () => {
    const sessionDir = createPhaseSession("personas reset");
    let state = createInitialChatState({
      sessionDir,
      feature: "personas-reset",
      currentPhase: "discuss",
    });
    state = chatReducer(state, {
      type: "set-personas",
      personas: ["zilean", "ryze"],
    });

    const result = await executeChatCommand(state, {
      type: "personas",
      personas: [],
    });

    expect(result.state.options.personas).toEqual([]);
    expect(result.messages[0].text).toContain("personas reset");
    expect(result.messages[0].text).toContain("phase matrix defaults");
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

  it("/help returns a slash-command listing without mutating state", async () => {
    const sessionDir = createPhaseSession("help cmd");
    const state = createInitialChatState({
      sessionDir,
      feature: "help-cmd",
      currentPhase: "discuss",
    });

    const result = await executeChatCommand(state, { type: "help" });

    expect(result.state).toBe(state);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe("help");
    expect(result.messages[0].text).toContain("/phase");
    expect(result.messages[0].text).toContain("/autopilot");
    expect(result.messages[0].text).toContain("/quit");
  });

  it("/quit returns a quit message without throwing or mutating state", async () => {
    const sessionDir = createPhaseSession("quit cmd");
    const state = createInitialChatState({
      sessionDir,
      feature: "quit-cmd",
      currentPhase: "discuss",
    });

    const result = await executeChatCommand(state, { type: "quit" });

    expect(result.state).toBe(state);
    expect(result.messages[0]).toMatchObject({
      type: "quit",
      text: expect.stringContaining("exit requested"),
    });
  });

  it("/refresh re-reads STATE.md / CONTEXT.md / PLAN.md from disk", async () => {
    const sessionDir = createPhaseSession("refresh sync");
    const state = createInitialChatState({
      sessionDir,
      feature: "refresh-sync",
      currentPhase: "discuss",
    });

    // Simulate an external edit: write CONTEXT.md / PLAN.md and
    // advance currentPhase by replaying writeState through loadState.
    fs.writeFileSync(
      path.join(sessionDir, "CONTEXT.md"),
      "## problem\nx",
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionDir, "PLAN.md"),
      "## approach\ny",
      "utf8",
    );
    const persisted = loadState(sessionDir);
    persisted.currentPhase = "build";
    persisted.history = ["discuss", "plan", "build"];
    fs.writeFileSync(
      path.join(sessionDir, "STATE.md"),
      [
        "---",
        `feature: ${persisted.feature}`,
        "currentPhase: build",
        "history: [discuss, plan, build]",
        "gates: []",
        "blockers: []",
        `createdAt: ${persisted.createdAt}`,
        `updatedAt: ${new Date().toISOString()}`,
        "---",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await executeChatCommand(state, { type: "refresh" });

    expect(result.state.currentPhase).toBe("build");
    expect(result.state.hasContext).toBe(true);
    expect(result.state.hasPlan).toBe(true);
    expect(result.messages[0]).toMatchObject({
      type: "refresh",
      text: expect.stringContaining("phase=build"),
    });
  });

  it("/open context loads the file into state.detail", async () => {
    const sessionDir = createPhaseSession("open context");
    fs.writeFileSync(
      path.join(sessionDir, "CONTEXT.md"),
      "## problem\nrefund SLA\n",
    );
    const state = createInitialChatState({
      sessionDir,
      feature: "open-context",
      currentPhase: "discuss",
    });

    const result = await executeChatCommand(state, {
      type: "open",
      target: "context",
    });

    expect(result.detail).toContain("# CONTEXT.md");
    expect(result.detail).toContain("refund SLA");
    expect(result.messages).toEqual([
      { type: "open", text: "opened context" },
    ]);
  });

  it("/open synthesis falls back to a missing-state when phase has none", async () => {
    const sessionDir = createPhaseSession("open synth missing");
    const state = createInitialChatState({
      sessionDir,
      feature: "open-synth-missing",
      currentPhase: "plan",
    });

    const result = await executeChatCommand(state, {
      type: "open",
      target: "synthesis",
    });

    expect(result.detail).toContain("# synthesis — plan");
    expect(result.detail).toContain("(missing");
  });

  it("/open workers lists per-phase files without embedding their content", async () => {
    const sessionDir = createPhaseSession("open workers");
    const phaseDir = path.join(sessionDir, "workers", "discuss");
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, "ryze.md"), "long content body");
    const state = createInitialChatState({
      sessionDir,
      feature: "open-workers",
      currentPhase: "discuss",
    });

    const result = await executeChatCommand(state, {
      type: "open",
      target: "workers",
    });

    expect(result.detail).toContain("# workers index");
    expect(result.detail).toContain("- ryze.md");
    expect(result.detail).not.toContain("long content body");
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

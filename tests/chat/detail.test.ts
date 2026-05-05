import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhaseDetail,
  readSynthesis,
  summarizeWorkers,
} from "../../src/chat/detail.js";
import { handleChatInput } from "../../src/chat/controller.js";
import { createInitialChatState } from "../../src/chat/state.js";
import { clearDefaultsCache, saveWorkspaceConfig } from "../../src/config.js";
import { createPhaseSession } from "../../src/phases/session.js";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace.js";
import { captureConsole } from "../../src/util/capture.js";
import type { WorkerResult } from "../../src/types.js";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-chat-detail-"));
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

function fakeWorker(name: string, stdout: string, status = 0): WorkerResult {
  return {
    agentName: name,
    agent: { runtime: "codex", model: "x", description: "" },
    prompt: "",
    relevantSkills: [],
    options: {},
    spec: { command: "true", args: [], cwd: tmp },
    outputDir: path.join(tmp, "workers", "ad-hoc"),
    stdout,
    stderr: "",
    status,
    signal: null,
  };
}

describe("chat/detail builders", () => {
  it("readSynthesis returns null when no synthesis file exists", () => {
    const sessionDir = createPhaseSession("detail empty");
    expect(readSynthesis(sessionDir, "discuss")).toBe(null);
  });

  it("readSynthesis returns the file contents when present", () => {
    const sessionDir = createPhaseSession("detail synth");
    const phaseDir = path.join(sessionDir, "workers", "discuss");
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, "synthesis.md"),
      "## summary\n- decision A\n",
      "utf8",
    );

    const synth = readSynthesis(sessionDir, "discuss");
    expect(synth).toContain("decision A");
  });

  it("summarizeWorkers describes each worker with status and head excerpt", () => {
    const summary = summarizeWorkers([
      fakeWorker("ryze", "first line\nsecond line"),
      fakeWorker("zilean", "", 1),
    ]);
    expect(summary).toContain("- ryze status=0");
    expect(summary).toContain("first line");
    expect(summary).toContain("- zilean status=1");
  });

  it("buildPhaseDetail prefers synthesis when both exist", () => {
    const sessionDir = createPhaseSession("detail prefer");
    const phaseDir = path.join(sessionDir, "workers", "discuss");
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, "synthesis.md"),
      "consolidated decision",
      "utf8",
    );

    const detail = buildPhaseDetail(sessionDir, "discuss", [
      fakeWorker("ryze", "raw output"),
    ]);
    expect(detail).toContain("# synthesis — discuss");
    expect(detail).toContain("consolidated decision");
    expect(detail).not.toContain("raw output");
  });

  it("buildPhaseDetail falls back to worker summary when synthesis is missing", () => {
    const sessionDir = createPhaseSession("detail fallback");
    const detail = buildPhaseDetail(sessionDir, "plan", [
      fakeWorker("ornn", "approach: incremental"),
    ]);
    expect(detail).toContain("# workers — plan (synthesis missing)");
    expect(detail).toContain("- ornn status=0");
    expect(detail).toContain("approach: incremental");
  });

  it("buildPhaseDetail returns an empty-state message when nothing is available", () => {
    const sessionDir = createPhaseSession("detail nothing");
    const detail = buildPhaseDetail(sessionDir, "build");
    expect(detail).toContain("# build");
    expect(detail).toContain("(no synthesis or worker output yet)");
  });
});

describe("chat/controller detail integration", () => {
  it("updates snapshot.detail with phase content after a phase run", async () => {
    const sessionDir = createPhaseSession("detail integration");
    const snapshot = {
      state: createInitialChatState({
        sessionDir,
        feature: "detail-integration",
        currentPhase: "discuss" as const,
      }),
      transcript: [],
      detail: "",
    };

    let result;
    await captureConsole([], async () => {
      result = await handleChatInput(snapshot, "/phase discuss clarify scope");
    });

    expect(result?.detail).not.toBe("");
    expect(result?.detail).toContain("discuss");
  });

  it("prefers synthesis.md when it has real content", async () => {
    const sessionDir = createPhaseSession("detail synth content");
    const phaseDir = path.join(sessionDir, "workers", "discuss");
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, "synthesis.md"),
      "## consolidated\n- decision A\n- decision B\n",
      "utf8",
    );

    let state = createInitialChatState({
      sessionDir,
      feature: "detail-synth-content",
      currentPhase: "discuss",
    });
    // Skip the synth re-run so the seeded synthesis.md is preserved.
    state = {
      ...state,
      options: { ...state.options, synthesize: false },
    };

    // Force buildPhaseDetail to run by invoking through the controller
    // via a /status command would be a no-op (no phaseResult), so use a
    // direct buildPhaseDetail call instead — controller wiring is
    // covered by the previous test.
    const detail = buildPhaseDetail(sessionDir, "discuss", []);
    expect(detail).toContain("# synthesis — discuss");
    expect(detail).toContain("decision A");
  });

  it("falls back to worker summary when synthesis is disabled", async () => {
    const sessionDir = createPhaseSession("detail no synth");
    let state = createInitialChatState({
      sessionDir,
      feature: "detail-no-synth",
      currentPhase: "discuss",
    });
    state = {
      ...state,
      options: { ...state.options, synthesize: false },
    };
    const snapshot = { state, transcript: [], detail: "" };

    let result;
    await captureConsole([], async () => {
      result = await handleChatInput(snapshot, "/phase discuss clarify scope");
    });

    expect(result?.detail).toContain(
      "# workers — discuss (synthesis missing)",
    );
    expect(result?.detail).toContain("- ryze status=0");
  });

  it("leaves snapshot.detail untouched for non-phase commands", async () => {
    const sessionDir = createPhaseSession("detail noop");
    const snapshot = {
      state: createInitialChatState({
        sessionDir,
        feature: "detail-noop",
        currentPhase: "discuss" as const,
      }),
      transcript: [],
      detail: "previous detail",
    };

    const result = await handleChatInput(snapshot, "/secondary on");
    expect(result.detail).toBe("previous detail");
  });
});

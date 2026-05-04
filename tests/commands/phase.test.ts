import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture";
import { runPhaseCommand } from "../../src/commands/phase";
import {
  createPhaseSession,
  loadState,
  resolvePhaseSession,
} from "../../src/phases/session";
import { LoomPhase } from "../../src/types";
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-phase-cmd-"));
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

describe("runPhaseCommand — argument parsing", () => {
  it("rejects when phase positional is missing", async () => {
    await expect(runPhaseCommand([], {})).rejects.toThrow(/Usage:/);
  });

  it("rejects when phase positional is unknown", async () => {
    await expect(runPhaseCommand(["nope"], {})).rejects.toThrow(
      /unknown phase/i,
    );
  });

  it("requires --feature OR a task or 'latest' resolution", async () => {
    await expect(runPhaseCommand(["discuss"], {})).rejects.toThrow(
      /feature|task/i,
    );
  });
});

describe("runPhaseCommand — session management", () => {
  it("creates a new session when --feature is provided and no session exists", async () => {
    await captureConsole([], async () => {
      await runPhaseCommand(["discuss", "build a todo app"], {
        feature: "todo-app",
        synthesize: false,
      });
    });
    const session = resolvePhaseSession("todo-app");
    expect(session).toBeTruthy();
    expect(loadState(session as string).feature).toBe("todo-app");
  });

  it("uses an existing session when --feature matches a slug", async () => {
    const sessionDir = createPhaseSession("existing");
    const before = loadState(sessionDir).updatedAt;
    await captureConsole([], async () => {
      await runPhaseCommand(["plan", "x"], {
        feature: "existing",
        synthesize: false,
      });
    });
    const after = loadState(sessionDir);
    expect(after.currentPhase).toBe("plan");
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime(),
    );
  });

  it("with --feature=latest, resolves the most recent session", async () => {
    createPhaseSession("alpha");
    const beta = createPhaseSession("beta");
    await captureConsole([], async () => {
      await runPhaseCommand(["plan", "x"], {
        feature: "latest",
        synthesize: false,
      });
    });
    expect(loadState(beta).currentPhase).toBe("plan");
  });
});

describe("runPhaseCommand — gate decisions", () => {
  it("--gate proceed appends a gate record without invoking workers", async () => {
    const sessionDir = createPhaseSession("gated");
    await captureConsole([], async () => {
      await runPhaseCommand(["discuss"], {
        feature: "gated",
        gate: "proceed",
        note: "looks good",
      });
    });
    const state = loadState(sessionDir);
    expect(state.gates).toHaveLength(1);
    expect(state.gates[0]).toMatchObject({
      phase: "discuss",
      decision: "proceed",
      note: "looks good",
    });
  });

  it("--gate revise stays in current phase (no history advance)", async () => {
    const sessionDir = createPhaseSession("gated");
    await captureConsole([], async () => {
      await runPhaseCommand(["discuss"], {
        feature: "gated",
        gate: "revise",
      });
    });
    const state = loadState(sessionDir);
    expect(state.history).toEqual(["discuss"]);
    expect(state.gates[0].decision).toBe("revise");
  });

  it("--gate with unknown decision throws", async () => {
    createPhaseSession("gated");
    await expect(
      runPhaseCommand(["discuss"], {
        feature: "gated",
        gate: "yolo",
      }),
    ).rejects.toThrow(/gate/i);
  });
});

describe("runPhaseCommand — synthesize default", () => {
  it("synthesize defaults to true when flag is omitted", async () => {
    await captureConsole([], async () => {
      await runPhaseCommand(["discuss", "build a todo"], {
        feature: "todo",
      });
    });
    const session = resolvePhaseSession("todo");
    const synthFile = path.join(
      session as string,
      "workers",
      "discuss",
      "synthesis.md",
    );
    expect(fs.existsSync(synthFile)).toBe(true);
  });
});

describe("runPhaseCommand — secondary personas", () => {
  it("--dry-run --include-secondary prints primary and secondary runtime commands", async () => {
    const output: string[] = [];
    await captureConsole(output, async () => {
      await runPhaseCommand(["discuss", "build a todo"], {
        feature: "secondary-dry-run",
        "dry-run": true,
        "include-secondary": true,
        synthesize: false,
      });
    });
    const text = output.join("\n");
    expect(text).toContain("ryze:");
    expect(text).toContain("zilean:");
    expect(text).toContain("local-fast:");
  });

  it("--personas takes precedence over --include-secondary", async () => {
    const output: string[] = [];
    await captureConsole(output, async () => {
      await runPhaseCommand(["discuss", "build a todo"], {
        feature: "secondary-override",
        "dry-run": true,
        "include-secondary": true,
        personas: "zilean",
        synthesize: false,
      });
    });
    const text = output.join("\n");
    expect(text).not.toContain("ryze:");
    expect(text).toContain("zilean:");
    expect(text).not.toContain("local-fast:");
  });
});

describe("runPhaseCommand — phase coverage", () => {
  it.each<LoomPhase>([
    "discuss",
    "plan",
    "build",
    "review",
    "verify",
    "ship",
    "reflect",
  ])("accepts phase '%s' as valid input", async (phase) => {
    await captureConsole([], async () => {
      await runPhaseCommand([phase, "x"], {
        feature: phase,
        synthesize: false,
      });
    });
    const session = resolvePhaseSession(phase);
    expect(loadState(session as string).currentPhase).toBe(phase);
  });
});

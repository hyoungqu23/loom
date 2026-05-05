import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createPhaseSession, loadState } from "../../src/phases/session.js";
import { recordPhaseGate } from "../../src/phases/gate.js";
import { getActiveWorkspace, setActiveWorkspace } from "../../src/workspace.js";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-phase-gate-"));
  setActiveWorkspace(tmp);
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("phases/gate", () => {
  it("records a gate decision with an optional note", () => {
    const sessionDir = createPhaseSession("gate helper");

    const record = recordPhaseGate(sessionDir, "plan", {
      decision: "revise",
      note: "tighten tests",
    });

    expect(record.phase).toBe("plan");
    expect(record.decision).toBe("revise");
    expect(record.note).toBe("tighten tests");
    expect(loadState(sessionDir).gates).toEqual([record]);
  });

  it("appends gate decisions in order", () => {
    const sessionDir = createPhaseSession("gate order");

    const first = recordPhaseGate(sessionDir, "build", {
      decision: "revise",
      note: "fix edge case",
    });
    const second = recordPhaseGate(sessionDir, "build", {
      decision: "proceed",
    });

    expect(loadState(sessionDir).gates).toEqual([first, second]);
  });
});

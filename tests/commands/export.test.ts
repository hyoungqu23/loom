import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runExportCommand } from "../../src/commands/export.js";
import { createPhaseSession, writeContext } from "../../src/phases/session.js";
import { captureConsole } from "../../src/util/capture.js";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace.js";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-export-command-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("runExportCommand", () => {
  it("prints trajectory JSON for a feature", async () => {
    const dir = createPhaseSession("export me");
    writeContext(dir, {
      problem: "Export this feature.",
      user: "developers",
      glossary: [],
      decisions: [],
      nonGoals: [],
      openQuestions: [],
    });

    const buf: string[] = [];
    await captureConsole(buf, () =>
      runExportCommand(["trajectory"], { feature: "export-me" }),
    );

    const json = JSON.parse(buf.join("\n"));
    expect(json.feature).toBe("export-me");
    expect(json.sessionDir).toBe(dir);
    expect(json.artifacts.context).toContain("Export this feature.");
  });
});

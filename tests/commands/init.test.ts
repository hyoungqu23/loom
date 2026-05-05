import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture.js";
import { initWorkspace } from "../../src/commands/init.js";
import {
  getActiveWorkspace,
  loomStateRoot,
  setActiveWorkspace,
  workspaceRoot,
} from "../../src/workspace.js";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-init-test-"));
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("initWorkspace", () => {
  it("creates the .loom state directory under --cwd", async () => {
    let result;
    await captureConsole([], () => {
      result = initWorkspace({ cwd: tmp });
    });
    expect(fs.existsSync(result?.stateRoot as string)).toBe(true);
    expect(result?.stateRoot).toBe(loomStateRoot());
    expect(workspaceRoot()).toBe(path.resolve(tmp));
  });

  it("creates .loom/config.json with default contents", async () => {
    await captureConsole([], () => initWorkspace({ cwd: tmp }));
    const cfgFile = path.join(loomStateRoot(), "config.json");
    expect(fs.existsSync(cfgFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    expect(parsed).toHaveProperty("runtimes");
  });

  it("creates a LOOM.md guide file in the workspace root", async () => {
    await captureConsole([], () => initWorkspace({ cwd: tmp }));
    const guide = path.join(workspaceRoot(), "LOOM.md");
    expect(fs.existsSync(guide)).toBe(true);
    expect(fs.readFileSync(guide, "utf8")).toMatch(/^# LOOM/);
  });

  it("does not overwrite existing files without --force", async () => {
    await captureConsole([], () => initWorkspace({ cwd: tmp }));
    const guide = path.join(workspaceRoot(), "LOOM.md");
    fs.writeFileSync(guide, "CUSTOMIZED");
    await captureConsole([], () => initWorkspace({ cwd: tmp }));
    expect(fs.readFileSync(guide, "utf8")).toBe("CUSTOMIZED");
  });

  it("overwrites files when --force is set", async () => {
    await captureConsole([], () => initWorkspace({ cwd: tmp }));
    const guide = path.join(workspaceRoot(), "LOOM.md");
    fs.writeFileSync(guide, "CUSTOMIZED");
    await captureConsole([], () => initWorkspace({ cwd: tmp, force: true }));
    expect(fs.readFileSync(guide, "utf8")).toMatch(/^# LOOM/);
  });
});

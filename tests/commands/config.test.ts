import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture.js";
import { runConfigCommand } from "../../src/commands/config.js";
import {
  clearDefaultsCache,
  loadWorkspaceConfig,
  saveWorkspaceConfig,
} from "../../src/config.js";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
  workspaceConfigPath,
} from "../../src/workspace.js";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-cmd-config-test-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
  clearDefaultsCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("runConfigCommand", () => {
  it("prints help when --help flag is set", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => runConfigCommand([], { help: true }));
    expect(buf.join("\n")).toMatch(/loom config/);
  });

  it("prints help for explicit 'help' subcommand", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => runConfigCommand(["help"], {}));
    expect(buf.join("\n")).toMatch(/loom config/);
  });

  it("'path' prints workspace config path", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => runConfigCommand(["path"], {}));
    expect(buf.join("\n")).toBe(workspaceConfigPath());
  });

  it("'show' (no path) prints full merged config as JSON", async () => {
    saveWorkspaceConfig({ runtimes: { codex: { command: "true" } } });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () => runConfigCommand(["show"], {}));
    const text = buf.join("\n");
    expect(text).toMatch(/^\{/);
    expect(text).toMatch(/runtimes/);
  });

  it("'show <path>' prints just that subtree", async () => {
    saveWorkspaceConfig({
      runtimes: { codex: { command: "true", model: "gpt" } },
    });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () =>
      runConfigCommand(["show", "runtimes.codex.command"], {}),
    );
    expect(buf.join("\n").trim()).toBe('"true"');
  });

  it("'show' throws when path is unknown", async () => {
    await expect(
      captureConsole([], () =>
        runConfigCommand(["show", "nope.notreal"], {}),
      ),
    ).rejects.toThrow(/not found/);
  });

  it("'set' rejects missing arguments", async () => {
    await expect(
      captureConsole([], () => runConfigCommand(["set"], {})),
    ).rejects.toThrow(/Usage/);
  });

  it("'set' writes a coerced value into the workspace config", async () => {
    await captureConsole([], () =>
      runConfigCommand(["set", "agents.kayle.model", "opus"], {}),
    );
    const cfg = loadWorkspaceConfig();
    const agents = cfg["agents"] as { [k: string]: { model: string } };
    expect(agents["kayle"]?.model).toBe("opus");
  });

  it("'set' parses booleans and numbers via parseConfigValue", async () => {
    await captureConsole([], () =>
      runConfigCommand(["set", "runtimes.codex.timeoutMs", "1500"], {}),
    );
    const cfg = loadWorkspaceConfig();
    const runtimes = cfg["runtimes"] as {
      [k: string]: { timeoutMs?: number };
    };
    expect(runtimes["codex"]?.timeoutMs).toBe(1500);
  });

  it("rejects an unknown subcommand", async () => {
    await expect(
      captureConsole([], () => runConfigCommand(["bogus"], {})),
    ).rejects.toThrow(/Unknown config command/);
  });
});

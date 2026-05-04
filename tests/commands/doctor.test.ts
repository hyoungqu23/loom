import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture";
import { runDoctor } from "../../src/commands/doctor";
import { clearDefaultsCache, saveWorkspaceConfig } from "../../src/config";
import { clearCommandCheckCache } from "../../src/util/shell";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-doctor-test-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
  clearDefaultsCache();
  clearCommandCheckCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  clearCommandCheckCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("runDoctor", () => {
  it("prints a 'Runtime Doctor' header", async () => {
    saveWorkspaceConfig({
      runtimes: { codex: { command: "loom-fake-binary-xyz" } },
    });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () => runDoctor({}));
    expect(buf.join("\n")).toMatch(/Runtime Doctor/);
  });

  it("prints runtime capability information", async () => {
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: "true", extraArgs: [] },
      },
    });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () => runDoctor({ runtimes: "codex" }));
    const text = buf.join("\n");
    expect(text).toContain("capabilities:");
    expect(text).toContain("approvals");
    expect(text).toContain("cwd");
  });

  it("marks a missing binary with MISS", async () => {
    saveWorkspaceConfig({
      runtimes: { codex: { command: "loom-fake-binary-xyz-12345" } },
    });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () => runDoctor({}));
    expect(buf.join("\n")).toMatch(/codex.*MISS/);
  });

  it("marks an existing binary with OK", async () => {
    saveWorkspaceConfig({
      runtimes: { codex: { command: "true" } },
    });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () => runDoctor({}));
    expect(buf.join("\n")).toMatch(/codex.*OK/);
  });

  it("only reports runtimes listed in --runtimes", async () => {
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: "true" },
        claude: { command: "true" },
      },
    });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () => runDoctor({ runtimes: "codex" }));
    const text = buf.join("\n");
    expect(text).toMatch(/codex/);
    expect(text).not.toMatch(/claude/);
  });

  it("includes a smoke heading when --smoke is set", async () => {
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: "loom-fake-binary-xyz-12345" },
      },
    });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () =>
      runDoctor({ smoke: true, runtimes: "codex" }),
    );
    expect(buf.join("\n")).toMatch(/Runtime Doctor \+ Smoke/);
  });
});

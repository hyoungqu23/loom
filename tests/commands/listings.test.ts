import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture";
import { printAgents, printInstalledSkills } from "../../src/commands/listings";
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-listings-test-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
  clearDefaultsCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("printAgents", () => {
  it("prints an Agent Registry header", async () => {
    saveWorkspaceConfig({
      agents: { kayle: { runtime: "codex", model: "gpt", description: "rev" } },
    });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () => printAgents());
    expect(buf.join("\n")).toMatch(/Agent Registry/);
  });

  it("includes one row per configured agent", async () => {
    saveWorkspaceConfig({
      agents: {
        kayle: { runtime: "codex", model: "gpt", description: "reviewer" },
        ornn: { runtime: "claude", model: "opus", description: "planner" },
      },
    });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () => printAgents());
    const text = buf.join("\n");
    expect(text).toMatch(/kayle/);
    expect(text).toMatch(/ornn/);
  });

  it("renders model/effort when effort is set", async () => {
    saveWorkspaceConfig({
      agents: {
        kayle: {
          runtime: "codex",
          model: "gpt-5",
          effort: "xhigh",
          description: "rev",
        },
      },
    });
    clearDefaultsCache();
    const buf: string[] = [];
    await captureConsole(buf, () => printAgents());
    expect(buf.join("\n")).toMatch(/gpt-5\/xhigh/);
  });
});

describe("printInstalledSkills", () => {
  it("prints a Skills header", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => printInstalledSkills());
    expect(buf.join("\n")).toMatch(/Skills/);
  });

  it("renders one row per installed skill (or '(none installed)')", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => printInstalledSkills());
    const text = buf.join("\n");
    expect(text.startsWith("Skills")).toBe(true);
    expect(text.length).toBeGreaterThan("Skills\n".length);
  });
});

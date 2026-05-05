import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture.js";
import { printAgents, printInstalledSkills, runSkillsCommand } from "../../src/commands/listings.js";
import { appendMetricEvent } from "../../src/metrics/events.js";
import { clearDefaultsCache, saveWorkspaceConfig } from "../../src/config.js";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace.js";

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

describe("runSkillsCommand", () => {
  it("prints review-needed skills from failed metric events", async () => {
    appendMetricEvent({
      type: "phase",
      feature: "auth",
      phase: "verify",
      durationMs: 5,
      workerCount: 1,
      failedCount: 1,
      skills: ["test-driven-development"],
    });

    const buf: string[] = [];
    await captureConsole(buf, () => runSkillsCommand(["review"]));

    const text = buf.join("\n");
    expect(text).toContain("Skills Review");
    expect(text).toContain("test-driven-development");
    expect(text).toContain("failures=1");
  });
});

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDefaultsCache,
  loadDefaults,
  loadWorkspaceConfig,
  saveWorkspaceConfig,
} from "../src/config";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
  workspaceConfigPath,
} from "../src/workspace";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-config-test-"));
  setActiveWorkspace(tmp);
  clearDefaultsCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("loadDefaults", () => {
  it("returns the package defaults when no workspace config exists", () => {
    const defaults = loadDefaults();
    expect(defaults.orchestrator.name).toBeDefined();
    expect(defaults.runtimes).toBeDefined();
    expect(defaults.agents).toBeDefined();
  });

  it("merges workspace overrides into runtimes", () => {
    ensureWorkspaceState();
    fs.writeFileSync(
      workspaceConfigPath(),
      JSON.stringify({
        runtimes: { codex: { model: "custom-model" } },
      }),
    );
    const defaults = loadDefaults();
    expect(defaults.runtimes.codex.model).toBe("custom-model");
  });

  it("preserves un-overridden fields after a merge", () => {
    ensureWorkspaceState();
    fs.writeFileSync(
      workspaceConfigPath(),
      JSON.stringify({
        runtimes: { codex: { model: "custom-model" } },
      }),
    );
    const defaults = loadDefaults();
    expect(defaults.runtimes.codex.command).toBe("codex");
  });

  it("does not mutate the cached package defaults across calls", () => {
    ensureWorkspaceState();
    fs.writeFileSync(
      workspaceConfigPath(),
      JSON.stringify({
        runtimes: { codex: { model: "first" } },
      }),
    );
    loadDefaults();

    fs.writeFileSync(
      workspaceConfigPath(),
      JSON.stringify({
        runtimes: { codex: { model: "second" } },
      }),
    );
    const defaults = loadDefaults();
    expect(defaults.runtimes.codex.model).toBe("second");
  });

  it("returns a fresh clone on workspace cache hits", () => {
    ensureWorkspaceState();
    fs.writeFileSync(
      workspaceConfigPath(),
      JSON.stringify({
        runtimes: { codex: { model: "cached-model" } },
      }),
    );

    const first = loadDefaults();
    first.runtimes.codex.model = "mutated-by-caller";

    const second = loadDefaults();
    expect(second.runtimes.codex.model).toBe("cached-model");
  });

  it("returns a fresh clone when no workspace config exists", () => {
    const first = loadDefaults();
    first.language = "mutated-by-caller";

    const second = loadDefaults();
    expect(second.language).not.toBe("mutated-by-caller");
  });
});

describe("loadWorkspaceConfig", () => {
  it("returns an empty object when config.json does not exist", () => {
    expect(loadWorkspaceConfig()).toEqual({});
  });

  it("returns the parsed contents when config.json exists", () => {
    ensureWorkspaceState();
    fs.writeFileSync(workspaceConfigPath(), JSON.stringify({ foo: "bar" }));
    expect(loadWorkspaceConfig()).toEqual({ foo: "bar" });
  });
});

describe("saveWorkspaceConfig", () => {
  it("creates the workspace state directory and writes config.json", () => {
    saveWorkspaceConfig({ x: 1 });
    expect(fs.existsSync(workspaceConfigPath())).toBe(true);
    expect(JSON.parse(fs.readFileSync(workspaceConfigPath(), "utf8"))).toEqual({
      x: 1,
    });
  });

  it("overwrites existing config.json", () => {
    saveWorkspaceConfig({ first: true });
    saveWorkspaceConfig({ second: true });
    expect(loadWorkspaceConfig()).toEqual({ second: true });
  });
});

describe("clearDefaultsCache", () => {
  it("forces re-reading of the package defaults file", () => {
    // Pre-warm cache
    loadDefaults();
    // Clear and re-load — must not throw and must return a defaults object
    clearDefaultsCache();
    const fresh = loadDefaults();
    expect(fresh.orchestrator).toBeDefined();
  });
});

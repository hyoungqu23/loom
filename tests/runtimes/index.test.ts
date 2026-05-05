import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildRuntimeCommand,
  getRuntimeAdapter,
  listRuntimeNames,
  runtimeVersion,
} from "../../src/runtimes/index.js";
import { clearDefaultsCache } from "../../src/config.js";
import { getActiveWorkspace, setActiveWorkspace } from "../../src/workspace.js";

let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  clearDefaultsCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
});

describe("listRuntimeNames", () => {
  it("returns the four built-in adapters", () => {
    const names = listRuntimeNames();
    expect(names).toContain("codex");
    expect(names).toContain("claude");
    expect(names).toContain("gemini");
    expect(names).toContain("ollama");
  });
});

describe("getRuntimeAdapter", () => {
  it("returns the adapter for a known runtime name", () => {
    expect(getRuntimeAdapter("codex").name).toBe("codex");
    expect(getRuntimeAdapter("claude").name).toBe("claude");
  });

  it("throws on an unknown runtime", () => {
    expect(() => getRuntimeAdapter("nonexistent-runtime")).toThrow(
      /Unknown runtime: nonexistent-runtime/,
    );
  });
});

describe("buildRuntimeCommand", () => {
  it("delegates to the runtime's adapter for codex", () => {
    const spec = buildRuntimeCommand("codex", "do thing", {
      cwd: "/tmp/cwd",
    });
    expect(spec.command).toBe("codex");
    expect(spec.args).toContain("exec");
    expect(spec.stdin).toBe("do thing");
  });

  it("uses options.model when provided", () => {
    const spec = buildRuntimeCommand("codex", "x", {
      cwd: "/tmp/cwd",
      model: "custom-model",
    });
    const idx = spec.args.indexOf("--model");
    expect(spec.args[idx + 1]).toBe("custom-model");
  });

  it("falls back to runtime config model when options.model is absent", () => {
    const spec = buildRuntimeCommand("codex", "x", { cwd: "/tmp/cwd" });
    const idx = spec.args.indexOf("--model");
    // Falls back to defaults.runtimes.codex.model from defaults.json.
    expect(spec.args[idx + 1]).toBeTruthy();
  });

  it("throws on unknown runtime", () => {
    expect(() =>
      buildRuntimeCommand("does-not-exist", "x", { cwd: "/tmp/cwd" }),
    ).toThrow(/Unknown runtime/);
  });

  it("resolves cwd to an absolute path", () => {
    const spec = buildRuntimeCommand("codex", "x", { cwd: "/tmp/relative" });
    expect(spec.cwd.startsWith("/")).toBe(true);
  });
});

describe("runtimeVersion", () => {
  it("returns ok status for a real binary like 'node'", () => {
    const info = runtimeVersion("codex", "node");
    expect(info.status).toBe(0);
    // node prints something like "v22.x.x"
    expect(info.stdout).toMatch(/^v\d+\./);
  });

  it("returns non-zero status for a non-existent binary", () => {
    const info = runtimeVersion("codex", "loom-nonexistent-bin-xyz");
    expect(info.status).not.toBe(0);
  });
});

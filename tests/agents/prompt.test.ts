import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRelativeFile, withRolePrompt } from "../../src/agents/prompt.js";
import { clearDefaultsCache } from "../../src/config.js";
import { AgentConfig } from "../../src/types.js";
import {
  getActiveWorkspace,
  getPackageRoot,
  setActiveWorkspace,
} from "../../src/workspace.js";

const baseAgent = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  description: "",
  runtime: "codex",
  model: "x",
  ...overrides,
});

let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
});

describe("readRelativeFile", () => {
  it("returns empty string for empty path", () => {
    expect(readRelativeFile("")).toBe("");
  });

  it("returns empty string for a non-existent file", () => {
    expect(readRelativeFile("does/not/exist.md")).toBe("");
  });

  it("reads a file relative to the package root and trims whitespace", () => {
    // README.md sits at the package root and is shipped with the repo.
    const content = readRelativeFile("README.md");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toBe(content.trim());
  });

  it("throws when the path escapes the package root", () => {
    expect(() => readRelativeFile("../package.json")).toThrow(
      /escapes package root/i,
    );
  });

  it("throws when given an absolute path outside the package root", () => {
    const outside = path.resolve(getPackageRoot(), "..", "package.json");
    expect(() => readRelativeFile(outside)).toThrow(/escapes package root/i);
  });
});

describe("withRolePrompt", () => {
  it("includes the user task verbatim", () => {
    const result = withRolePrompt(
      "Do the thing",
      baseAgent(),
      "twistedfate",
    );
    expect(result).toContain("Task:\nDo the thing");
  });

  it("uses '---' as the section separator", () => {
    const result = withRolePrompt("X", baseAgent(), "twistedfate");
    expect(result).toContain("\n\n---\n\n");
  });

  it("falls back to the empty role prompt when none is configured", () => {
    const result = withRolePrompt("X", baseAgent(), "nameless");
    // No role prompt should still produce a usable prompt with at least the task.
    expect(result).toContain("Task:\nX");
  });

  it("omits role prompt when rolePrompt path is missing on disk", () => {
    const result = withRolePrompt(
      "X",
      baseAgent({ rolePrompt: "harness/agents/__nonexistent__.md" }),
      "any",
    );
    expect(result).toContain("Task:\nX");
    expect(result).not.toContain("__nonexistent__");
  });
});

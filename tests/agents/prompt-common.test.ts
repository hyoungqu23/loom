import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withRolePrompt } from "../../src/agents/prompt.js";
import { clearDefaultsCache, saveWorkspaceConfig } from "../../src/config.js";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  getPackageRoot,
  setActiveWorkspace,
} from "../../src/workspace.js";

let tmp: string;
let originalWorkspace: string;
const commonPath = path.join(getPackageRoot(), "harness", "prompts", "_common.md");
let backupCommon: string | null = null;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-prompt-common-test-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
  clearDefaultsCache();
  backupCommon = fs.existsSync(commonPath)
    ? fs.readFileSync(commonPath, "utf8")
    : null;
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (backupCommon === null) {
    if (fs.existsSync(commonPath)) fs.unlinkSync(commonPath);
  } else {
    fs.writeFileSync(commonPath, backupCommon);
  }
});

describe("withRolePrompt + _common.md prepend", () => {
  it("prepends _common.md content when present at harness/prompts/_common.md", () => {
    fs.writeFileSync(commonPath, "COMMON_SYSTEM_PROMPT_MARKER");
    const result = withRolePrompt(
      "do something",
      { description: "x", runtime: "codex", model: "x" },
      "kayle",
    );
    expect(result.startsWith("COMMON_SYSTEM_PROMPT_MARKER")).toBe(true);
  });

  it("falls back to legacy layout when _common.md is absent", () => {
    if (fs.existsSync(commonPath)) fs.unlinkSync(commonPath);
    const result = withRolePrompt(
      "do something",
      { description: "x", runtime: "codex", model: "x" },
      "kayle",
    );
    expect(result).toMatch(/Task:\s*do something/);
    expect(result).not.toMatch(/COMMON_SYSTEM_PROMPT_MARKER/);
  });

  it("substitutes ${language} token with the configured language", () => {
    fs.writeFileSync(commonPath, "Respond in ${language} only.");
    saveWorkspaceConfig({ language: "ko" });
    clearDefaultsCache();
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "kayle",
    );
    expect(result).toMatch(/Respond in ko only\./);
  });

  it("substitutes ${language} with 'auto' when not configured", () => {
    fs.writeFileSync(commonPath, "Lang=${language}");
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "kayle",
    );
    expect(result).toMatch(/Lang=auto/);
  });

  it("substitutes ${agentName} token", () => {
    fs.writeFileSync(commonPath, "You are ${agentName}.");
    const result = withRolePrompt(
      "task",
      { description: "x", runtime: "codex", model: "x" },
      "viktor",
    );
    expect(result).toMatch(/You are viktor\./);
  });
});

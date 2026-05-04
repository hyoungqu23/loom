import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runRuntime } from "../../src/engine/runtime";
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-runtime-test-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
  clearDefaultsCache();
  // Override codex runtime to invoke `true` (POSIX no-op exit 0) so the test
  // doesn't depend on the real codex CLI being installed.
  saveWorkspaceConfig({
    runtimes: {
      codex: { command: "true", extraArgs: [] },
    },
  });
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("runRuntime", () => {
  it("creates a runtime-run directory under .loom/runtime-runs/<stamp>-<runtime>", async () => {
    const run = await runRuntime("codex", "prompt", { cwd: tmp });
    expect(run.dir.startsWith(path.join(tmp, ".loom", "runtime-runs"))).toBe(
      true,
    );
    expect(run.dir).toMatch(/-codex$/);
  });

  it("persists request.json with command + args + startedAt", async () => {
    const run = await runRuntime("codex", "prompt", { cwd: tmp });
    const requestPath = path.join(run.dir, "request.json");
    expect(fs.existsSync(requestPath)).toBe(true);
    const parsed: { command: string; args: string[]; startedAt: string } = JSON.parse(
      fs.readFileSync(requestPath, "utf8"),
    );
    expect(parsed.command).toBe("true");
    expect(Array.isArray(parsed.args)).toBe(true);
    expect(parsed.startedAt).toBeTruthy();
  });

  it("persists stdout.md, stderr.log, and result.json after the child closes", async () => {
    const run = await runRuntime("codex", "prompt", { cwd: tmp });
    expect(fs.existsSync(path.join(run.dir, "stdout.md"))).toBe(true);
    expect(fs.existsSync(path.join(run.dir, "stderr.log"))).toBe(true);
    expect(fs.existsSync(path.join(run.dir, "result.json"))).toBe(true);
  });

  it("returns the runtime result with status from the child process", async () => {
    const run = await runRuntime("codex", "prompt", { cwd: tmp });
    expect(run.result.status).toBe(0);
  });

  it("captures error when runtime command does not exist", async () => {
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: "loom-fake-binary-zzz-12345", extraArgs: [] },
      },
    });
    clearDefaultsCache();
    const run = await runRuntime("codex", "prompt", { cwd: tmp });
    expect(run.result.error).not.toBeNull();
  });
});

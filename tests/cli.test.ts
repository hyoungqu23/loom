import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureConsole } from "../src/util/capture";
import { main } from "../src/cli";
import { runCliCommand } from "../src/cli";
import { clearDefaultsCache } from "../src/config";
import { createPhaseSession } from "../src/phases/session";
import { addCronJob } from "../src/cron/jobs";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  loomStateRoot,
  setActiveWorkspace,
} from "../src/workspace";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-cli-test-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
  clearDefaultsCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("main", () => {
  it("prints help on `loom help`", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => main(["help"]));
    expect(buf.join("\n")).toMatch(/Usage:/);
  });

  it("prints help on `loom --help`", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => main(["--help"]));
    expect(buf.join("\n")).toMatch(/Usage:/);
  });

  it("throws on unknown command", async () => {
    await expect(captureConsole([], () => main(["bogus"]))).rejects.toThrow(
      /Unknown command/,
    );
  });

  it("dispatches to agents listing", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => main(["agents"]));
    expect(buf.join("\n")).toMatch(/Agent Registry/);
  });

  it("dispatches to skills listing", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => main(["skills"]));
    expect(buf.join("\n")).toMatch(/Skills/);
  });

  it("dispatches to skills review", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => main(["skills", "review"]));
    expect(buf.join("\n")).toMatch(/Skills Review/);
  });

  it("dispatches to memory command", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => main(["memory", "list"]));
    expect(buf.join("\n")).toMatch(/Memory Candidates/);
  });

  it("dispatches to metrics command", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => main(["metrics", "summary"]));
    expect(buf.join("\n")).toMatch(/Metrics Summary/);
  });

  it("dispatches to cron command", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => main(["cron", "list"]));
    expect(buf.join("\n")).toMatch(/Cron Jobs/);
  });

  it("dispatches to export command", async () => {
    createPhaseSession("exportable");
    const buf: string[] = [];
    await captureConsole(buf, () =>
      main(["export", "trajectory", "--feature", "exportable"]),
    );
    expect(JSON.parse(buf.join("\n")).feature).toBe("exportable");
  });

  it("dispatches `config show` to the config command", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => main(["config", "show"]));
    expect(buf.join("\n")).toMatch(/runtimes/);
  });

  it("dispatches `init --cwd <dir>` to initWorkspace", async () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "loom-init-cli-"));
    await captureConsole([], () => main(["init", "--cwd", target]));
    expect(fs.existsSync(loomStateRoot())).toBe(true);
    fs.rmSync(target, { recursive: true, force: true });
  });

  it.each(["run", "ask", "team", "shell", "tui", "wrap", "evolve", "promote", "sessions", "show", "last", "logs", "stderr", "clean"])(
    "`%s` is no longer a public command (v1 removed)",
    async (command) => {
      await expect(captureConsole([], () => main([command]))).rejects.toThrow(
        /Unknown command/,
      );
    },
  );

  it("respects --cwd by setting active workspace", async () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "loom-cwd-cli-"));
    await captureConsole([], () => main(["agents", "--cwd", target]));
    expect(getActiveWorkspace()).toBe(path.resolve(target));
    fs.rmSync(target, { recursive: true, force: true });
  });

  it("bare `loom` (no command) prints help instead of opening a UI", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => main([]));
    expect(buf.join("\n")).toMatch(/Usage:/);
  });
});

describe("runCliCommand", () => {
  it("returns captured stdout and status for command adapters", async () => {
    const result = await runCliCommand(["memory", "list"]);

    expect(result.status).toBe("ok");
    expect(result.stdout).toContain("Memory Candidates");
    expect(result.stderr).toBe("");
  });

  it("serializes command adapter executions so captures do not overlap", async () => {
    addCronJob({
      id: "fast",
      command: "node",
      args: ["-e", "process.exit(0)"],
      schedule: "@manual",
      cwd: tmp,
      feature: "fast",
      enabled: true,
      approvalMode: "allow-risky",
    });
    addCronJob({
      id: "slow",
      command: "node",
      args: ["-e", "setTimeout(() => process.exit(0), 40)"],
      schedule: "@manual",
      cwd: tmp,
      feature: "slow",
      enabled: true,
      approvalMode: "allow-risky",
    });

    const first = runCliCommand(["cron", "run", "fast"]);
    const second = runCliCommand(["cron", "run", "slow"]);

    const [a, b] = await Promise.all([first, second]);

    expect(a.stdout).toContain("cron fast status=0");
    expect(a.stdout).not.toContain("cron slow");
    expect(b.stdout).toContain("cron slow status=0");
    expect(b.stdout).not.toContain("cron fast");
  });
});

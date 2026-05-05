import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCronCommand } from "../../src/commands/cron.js";
import { addCronJob } from "../../src/cron/jobs.js";
import { captureConsole } from "../../src/util/capture.js";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace.js";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-cron-command-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("runCronCommand", () => {
  it("lists stored cron jobs", async () => {
    addCronJob({
      id: "nightly-qa",
      command: "true",
      args: [],
      schedule: "0 2 * * *",
      cwd: tmp,
      feature: "nightly-qa",
      enabled: true,
    });

    const buf: string[] = [];
    await captureConsole(buf, () => runCronCommand(["list"], {}));

    const text = buf.join("\n");
    expect(text).toContain("Cron Jobs");
    expect(text).toContain("nightly-qa");
    expect(text).toContain("0 2 * * *");
  });

  it("redacts secrets from listed cron command args", async () => {
    addCronJob({
      id: "webhook",
      command: "true",
      args: ["WEBHOOK_TOKEN=abc123"],
      schedule: "@manual",
      cwd: tmp,
      feature: "webhook",
      enabled: true,
    });

    const buf: string[] = [];
    await captureConsole(buf, () => runCronCommand(["list"], {}));

    const text = buf.join("\n");
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("WEBHOOK_TOKEN=abc123");
  });

  it("runs a stored cron job by id", async () => {
    addCronJob({
      id: "safe-command",
      command: "true",
      args: [],
      schedule: "@manual",
      cwd: tmp,
      feature: "safe-command",
      enabled: true,
    });

    const buf: string[] = [];
    await captureConsole(buf, () => runCronCommand(["run", "safe-command"], {}));

    expect(buf.join("\n")).toContain("status=0");
  });
});

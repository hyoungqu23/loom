import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCronCommand } from "../../src/commands/cron";
import { addCronJob } from "../../src/cron/jobs";
import { captureConsole } from "../../src/util/capture";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";

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
      command: "node",
      args: ["--version"],
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

  it("runs a stored cron job by id", async () => {
    addCronJob({
      id: "node-version",
      command: "node",
      args: ["--version"],
      schedule: "@manual",
      cwd: tmp,
      feature: "node-version",
      enabled: true,
    });

    const buf: string[] = [];
    await captureConsole(buf, () => runCronCommand(["run", "node-version"], {}));

    expect(buf.join("\n")).toContain("status=0");
  });
});

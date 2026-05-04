import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addCronJob,
  cronJobsPath,
  listCronJobs,
  runCronJob,
} from "../../src/cron/jobs";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-cron-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("cron jobs", () => {
  it("persists jobs with the cron schema", () => {
    addCronJob({
      id: "nightly-qa",
      command: "true",
      args: [],
      schedule: "0 2 * * *",
      cwd: tmp,
      feature: "nightly-qa",
      enabled: true,
    });

    expect(fs.existsSync(cronJobsPath())).toBe(true);
    expect(listCronJobs()).toEqual([
      expect.objectContaining({
        id: "nightly-qa",
        command: "true",
        schedule: "0 2 * * *",
        enabled: true,
        lastRunAt: null,
        lastStatus: null,
      }),
    ]);
  });

  it("runs enabled jobs and records lastRunAt / lastStatus", async () => {
    addCronJob({
      id: "safe-command",
      command: "true",
      args: [],
      schedule: "@manual",
      cwd: tmp,
      feature: "safe-command",
      enabled: true,
    });

    const result = await runCronJob("safe-command");

    expect(result.status).toBe(0);
    const [job] = listCronJobs();
    expect(job.lastRunAt).toMatch(/T/);
    expect(job.lastStatus).toBe(0);
  });

  it("does not run disabled jobs", async () => {
    addCronJob({
      id: "disabled",
      command: "true",
      args: [],
      schedule: "@manual",
      cwd: tmp,
      feature: "disabled",
      enabled: false,
    });

    await expect(runCronJob("disabled")).rejects.toThrow(/disabled/);
  });

  it("blocks high-risk jobs unless explicitly approved", async () => {
    fs.writeFileSync(path.join(tmp, ".env"), "SECRET_TOKEN=abc\n", "utf8");
    addCronJob({
      id: "read-secret",
      command: "cat",
      args: [".env"],
      schedule: "@manual",
      cwd: tmp,
      feature: "read-secret",
      enabled: true,
    });

    await expect(runCronJob("read-secret")).rejects.toThrow(
      /blocked by approval policy/,
    );
  });

  it("blocks medium-risk jobs unless explicitly approved", async () => {
    addCronJob({
      id: "network",
      command: "curl",
      args: ["https://example.com"],
      schedule: "@manual",
      cwd: tmp,
      feature: "network",
      enabled: true,
    });

    await expect(runCronJob("network")).rejects.toThrow(
      /blocked by approval policy/,
    );
  });

  it("allows high-risk jobs with explicit allow-risky approval mode", async () => {
    fs.writeFileSync(path.join(tmp, ".env"), "SECRET_TOKEN=abc\n", "utf8");
    addCronJob({
      id: "approved-secret-read",
      command: "cat",
      args: [".env"],
      schedule: "@manual",
      cwd: tmp,
      feature: "approved-secret-read",
      enabled: true,
      approvalMode: "allow-risky",
    });

    const result = await runCronJob("approved-secret-read");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SECRET_TOKEN=abc");
  });
});

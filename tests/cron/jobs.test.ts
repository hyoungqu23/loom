import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addCronJob,
  cronJobsPath,
  cronRunsRoot,
  listCronJobs,
  runCronJob,
} from "../../src/cron/jobs.js";
import { loadMetricEvents } from "../../src/metrics/events.js";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace.js";

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

  it("rejects jobs with cwd outside the active workspace", () => {
    expect(() =>
      addCronJob({
        id: "outside",
        command: "true",
        args: [],
        schedule: "@manual",
        cwd: os.tmpdir(),
        feature: "outside",
        enabled: true,
      }),
    ).toThrow(/escapes workspace/);
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

  it("persists stdout / stderr / result.json per run with redaction", async () => {
    fs.writeFileSync(path.join(tmp, ".env"), "SECRET_TOKEN=abc\n", "utf8");
    addCronJob({
      id: "redact-run",
      command: "cat",
      args: [".env"],
      schedule: "@manual",
      cwd: tmp,
      feature: "redact-run",
      enabled: true,
      approvalMode: "allow-risky",
    });

    await runCronJob("redact-run");

    const root = cronRunsRoot();
    const runs = fs.readdirSync(root).filter((name) => name.endsWith("-redact-run"));
    expect(runs.length).toBe(1);
    const dir = path.join(root, runs[0]);

    const stdout = fs.readFileSync(path.join(dir, "stdout.log"), "utf8");
    expect(stdout).not.toContain("SECRET_TOKEN=abc");
    expect(stdout).toContain("[REDACTED]");

    const result = JSON.parse(
      fs.readFileSync(path.join(dir, "result.json"), "utf8"),
    );
    expect(result.id).toBe("redact-run");
    expect(result.status).toBe(0);
    expect(result.command).toBe("cat");
    expect(result.args).toEqual([".env"]);
    expect(typeof result.durationMs).toBe("number");
    expect(result.startedAt).toMatch(/T/);
    expect(result.finishedAt).toMatch(/T/);
  });

  it("emits a cron metric event per run", async () => {
    addCronJob({
      id: "metric-run",
      command: "true",
      args: [],
      schedule: "@manual",
      cwd: tmp,
      feature: "metric-run",
      enabled: true,
    });

    await runCronJob("metric-run");

    const events = loadMetricEvents().filter((e) => e.type === "cron");
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({
      type: "cron",
      id: "metric-run",
      status: 0,
    });
  });
});

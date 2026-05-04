import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendMetricEvent,
  loadMetricEvents,
  metricsEventsPath,
  summarizeMetrics,
} from "../../src/metrics/events";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-metrics-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("metrics events", () => {
  it("appends phase events as JSONL", () => {
    appendMetricEvent({
      type: "phase",
      feature: "auth",
      phase: "plan",
      durationMs: 12,
      workerCount: 1,
      failedCount: 0,
      gateDecision: "proceed",
      skills: ["test-driven-development"],
    });

    expect(fs.existsSync(metricsEventsPath())).toBe(true);
    const events = loadMetricEvents();
    expect(events).toEqual([
      expect.objectContaining({
        type: "phase",
        feature: "auth",
        phase: "plan",
        durationMs: 12,
        workerCount: 1,
        skills: ["test-driven-development"],
      }),
    ]);
  });

  it("summarizes phase events by feature", () => {
    appendMetricEvent({
      type: "phase",
      feature: "auth",
      phase: "plan",
      durationMs: 10,
      workerCount: 1,
      failedCount: 0,
    });
    appendMetricEvent({
      type: "phase",
      feature: "auth",
      phase: "build",
      durationMs: 20,
      workerCount: 2,
      failedCount: 1,
    });

    expect(summarizeMetrics()).toEqual([
      {
        feature: "auth",
        phases: 2,
        durationMs: 30,
        workers: 3,
        failed: 1,
      },
    ]);
  });
});

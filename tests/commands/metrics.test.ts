import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMetricsCommand } from "../../src/commands/metrics.js";
import { appendMetricEvent } from "../../src/metrics/events.js";
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-metrics-command-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("runMetricsCommand", () => {
  it("prints feature metrics summary", async () => {
    appendMetricEvent({
      type: "phase",
      feature: "auth",
      phase: "plan",
      durationMs: 25,
      workerCount: 2,
      failedCount: 1,
    });

    const buf: string[] = [];
    await captureConsole(buf, () => runMetricsCommand(["summary"], {}));

    const text = buf.join("\n");
    expect(text).toContain("Metrics Summary");
    expect(text).toContain("auth");
    expect(text).toContain("failed=1");
  });
});

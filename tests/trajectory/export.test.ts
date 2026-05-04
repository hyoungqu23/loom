import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportTrajectory } from "../../src/trajectory/export";
import {
  appendWorkerOutput,
  createPhaseSession,
  loadState,
  writeState,
  writeContext,
} from "../../src/phases/session";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";
import { appendMetricEvent } from "../../src/metrics/events";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-trajectory-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("exportTrajectory", () => {
  it("exports feature session state, artifacts, worker outputs, and gates", () => {
    const dir = createPhaseSession("auth tokens");
    writeContext(dir, {
      problem: "Token refresh is flaky.",
      user: "developers",
      glossary: [],
      decisions: ["Redact secrets in export"],
      nonGoals: [],
      openQuestions: [],
    });
    appendWorkerOutput(
      dir,
      "plan",
      "ornn",
      "Use SECRET_TOKEN=abc during local reproduction.",
    );
    const state = loadState(dir);
    state.gates.push({
      phase: "plan",
      decision: "proceed",
      at: "2026-05-04T00:00:00.000Z",
      note: "temporary API_KEY=abc123 for reproduction",
    });
    writeState(dir, state);
    appendMetricEvent({
      type: "phase",
      feature: "auth-tokens",
      phase: "plan",
      durationMs: 10,
      workerCount: 1,
      failedCount: 1,
      skills: ["test-driven-development"],
      note: "PASSWORD=hunter2",
    });

    const trajectory = exportTrajectory("auth-tokens");

    expect(trajectory.feature).toBe("auth-tokens");
    expect(trajectory.state.gates).toHaveLength(1);
    expect(trajectory.artifacts.context).toContain("Token refresh is flaky.");
    expect(trajectory.workerOutputs[0].phase).toBe("plan");
    expect(trajectory.workerOutputs[0].body).toContain("[REDACTED]");
    expect(trajectory.metrics[0].skills).toContain("test-driven-development");
    expect(JSON.stringify(trajectory)).not.toContain("SECRET_TOKEN=abc");
    expect(JSON.stringify(trajectory)).not.toContain("API_KEY=abc123");
    expect(JSON.stringify(trajectory)).not.toContain("PASSWORD=hunter2");
  });
});

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAgentRun, runWorkerAsync } from "../../src/engine/worker";
import { clearDefaultsCache, saveWorkspaceConfig } from "../../src/config";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";
import { AgentRun, TeamHooks } from "../../src/types";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-worker-test-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
  clearDefaultsCache();
  // Override codex runtime to a no-op binary so we don't depend on real codex.
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

describe("runWorkerAsync", () => {
  it("creates the output directory", async () => {
    const worker = resolveAgentRun("twistedfate", "task body", { cwd: tmp });
    const out = path.join(tmp, "wout");
    await runWorkerAsync(worker, out);
    expect(fs.existsSync(out)).toBe(true);
  });

  it("writes request.json, stdout.md, stderr.log, result.json", async () => {
    const worker = resolveAgentRun("twistedfate", "task body", { cwd: tmp });
    const out = path.join(tmp, "wout");
    await runWorkerAsync(worker, out);
    expect(fs.existsSync(path.join(out, "request.json"))).toBe(true);
    expect(fs.existsSync(path.join(out, "stdout.md"))).toBe(true);
    expect(fs.existsSync(path.join(out, "stderr.log"))).toBe(true);
    expect(fs.existsSync(path.join(out, "result.json"))).toBe(true);
  });

  it("records command risk in request.json", async () => {
    const worker = resolveAgentRun("twistedfate", "task body", { cwd: tmp });
    const out = path.join(tmp, "wout");
    await runWorkerAsync(worker, out);

    const request = JSON.parse(
      fs.readFileSync(path.join(out, "request.json"), "utf8"),
    );
    expect(request.commandRisk.level).toBe("safe");
    expect(request.commandRisk.categories).toEqual([]);
  });

  it("blocks high-risk commands unless explicitly approved", async () => {
    fs.writeFileSync(path.join(tmp, ".env"), "SECRET_TOKEN=abc\n", "utf8");
    const worker: AgentRun = {
      agentName: "manual",
      agent: { description: "x", runtime: "manual", model: "x" },
      prompt: "x",
      options: { cwd: tmp },
      spec: {
        command: "cat",
        args: [".env"],
        cwd: tmp,
      },
    };
    const out = path.join(tmp, "blocked");
    const result = await runWorkerAsync(worker, out);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("blocked by approval policy");
    expect(result.stderr).toContain("secret-access");
    expect(fs.readFileSync(path.join(out, "stdout.md"), "utf8")).toBe("");
    const saved = JSON.parse(fs.readFileSync(path.join(out, "result.json"), "utf8"));
    expect(saved.denied).toBe(true);
  });

  it("returns a WorkerResult merging the agent run plan + stream output", async () => {
    const worker = resolveAgentRun("twistedfate", "task body", { cwd: tmp });
    const out = path.join(tmp, "wout");
    const result = await runWorkerAsync(worker, out);
    expect(result.agentName).toBe("twistedfate");
    expect(result.outputDir).toBe(out);
    expect(typeof result.stdout).toBe("string");
    expect(typeof result.stderr).toBe("string");
  });

  it("calls onWorkerStart hook before launching", async () => {
    const worker = resolveAgentRun("twistedfate", "x", { cwd: tmp });
    const out = path.join(tmp, "wout");
    let started = false;
    const hooks: TeamHooks = {
      onWorkerStart: () => {
        started = true;
      },
    };
    await runWorkerAsync(worker, out, hooks);
    expect(started).toBe(true);
  });

  it("calls onWorkerDone hook with the final result", async () => {
    const worker = resolveAgentRun("twistedfate", "x", { cwd: tmp });
    const out = path.join(tmp, "wout");
    let donePayload: { agentName?: string } = {};
    const hooks: TeamHooks = {
      onWorkerDone: (result) => {
        donePayload = { agentName: result.agentName };
      },
    };
    await runWorkerAsync(worker, out, hooks);
    expect(donePayload.agentName).toBe("twistedfate");
  });
});

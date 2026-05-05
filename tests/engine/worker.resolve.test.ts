import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAgentRun } from "../../src/engine/worker.js";
import { clearDefaultsCache } from "../../src/config.js";
import {
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace.js";

let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  clearDefaultsCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
});

describe("resolveAgentRun", () => {
  it("returns the agent name verbatim", () => {
    const run = resolveAgentRun("twistedfate", "task body", {});
    expect(run.agentName).toBe("twistedfate");
  });

  it("includes the agent's runtime config in the spec", () => {
    const run = resolveAgentRun("twistedfate", "x", {});
    expect(run.spec.command).toBeTruthy();
    expect(Array.isArray(run.spec.args)).toBe(true);
  });

  it("includes the task body inside the prompt", () => {
    const run = resolveAgentRun("twistedfate", "Compose a plan", {});
    expect(run.prompt).toContain("Compose a plan");
  });

  it("--model flag overrides the agent's default model", () => {
    const run = resolveAgentRun("twistedfate", "x", { model: "custom-model" });
    expect(run.options.model).toBe("custom-model");
  });

  it("falls back to the agent's model when --model not given", () => {
    const run = resolveAgentRun("twistedfate", "x", {});
    expect(run.options.model).toBeTruthy();
  });

  it("--effort flag overrides agent's default effort", () => {
    const run = resolveAgentRun("twistedfate", "x", { effort: "xhigh" });
    expect(run.options.effort).toBe("xhigh");
  });

  it("agentName is recorded in options.agent", () => {
    const run = resolveAgentRun("twistedfate", "x", {});
    expect(run.options.agent).toBe("twistedfate");
  });

  it("--timeout coerces to options.timeoutMs", () => {
    const run = resolveAgentRun("twistedfate", "x", { timeout: 5000 });
    expect(run.options.timeoutMs).toBe(5000);
  });

  it("throws on unknown agent", () => {
    expect(() => resolveAgentRun("nonexistent", "x", {})).toThrow(
      /Unknown agent/,
    );
  });
});

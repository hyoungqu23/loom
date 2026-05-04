import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAgentNames, loadAgent } from "../../src/agents/load";
import { clearDefaultsCache } from "../../src/config";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
  workspaceConfigPath,
} from "../../src/workspace";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-agents-test-"));
  setActiveWorkspace(tmp);
  clearDefaultsCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("loadAgent", () => {
  it("returns the package-default agent when present", () => {
    // 'twistedfate' (orchestrator) is part of the package defaults.
    const agent = loadAgent("twistedfate");
    expect(agent.runtime).toBeDefined();
    expect(agent.model).toBeDefined();
  });

  it("throws on an unknown agent name with a helpful message", () => {
    expect(() => loadAgent("nonexistent-agent-xyz")).toThrow(
      /Unknown agent.*nonexistent-agent-xyz/,
    );
  });

  it("returns workspace overrides for a known agent", () => {
    ensureWorkspaceState();
    fs.writeFileSync(
      workspaceConfigPath(),
      JSON.stringify({
        agents: { twistedfate: { description: "custom-desc" } },
      }),
    );
    expect(loadAgent("twistedfate").description).toBe("custom-desc");
  });
});

describe("listAgentNames", () => {
  it("returns the names of all configured agents", () => {
    const names = listAgentNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain("twistedfate");
  });

  it("includes workspace-defined agents", () => {
    ensureWorkspaceState();
    fs.writeFileSync(
      workspaceConfigPath(),
      JSON.stringify({
        agents: {
          customagent: {
            description: "x",
            runtime: "codex",
            model: "gpt-5.5",
          },
        },
      }),
    );
    expect(listAgentNames()).toContain("customagent");
  });
});

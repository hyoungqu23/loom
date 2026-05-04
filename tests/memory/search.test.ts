import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchFeatureSessions } from "../../src/memory/search";
import {
  appendWorkerOutput,
  createPhaseSession,
  writeContext,
  writePlan,
} from "../../src/phases/session";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-search-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("searchFeatureSessions", () => {
  it("ranks matching feature sessions and returns paths with summaries", () => {
    const authDir = createPhaseSession("auth cleanup");
    writeContext(authDir, {
      problem: "Reduce login failure during magic link authentication.",
      user: "operators",
      glossary: [],
      decisions: ["Use short-lived magic links"],
      nonGoals: [],
      openQuestions: [],
    });
    appendWorkerOutput(
      authDir,
      "discuss",
      "ryze",
      "Magic link auth needs clearer error copy.",
    );

    const billingDir = createPhaseSession("billing export");
    writePlan(billingDir, {
      approach: "Export invoices as CSV.",
      modules: ["billing"],
      acceptanceCriteria: ["CSV includes invoice id"],
      testPlan: [],
      risks: [],
    });

    const results = searchFeatureSessions("magic link auth");

    expect(results[0].feature).toBe("auth-cleanup");
    expect(results[0].path).toBe(authDir);
    expect(results[0].summary).toContain("magic link authentication");
    expect(results.some((r) => r.feature === "billing-export")).toBe(false);
  });
});

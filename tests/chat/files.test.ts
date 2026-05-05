import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  openContext,
  openPlan,
  openSynthesis,
  openWorkersIndex,
} from "../../src/chat/files";
import { createPhaseSession } from "../../src/phases/session";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-chat-files-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("chat/files", () => {
  it("openContext returns a missing-state when CONTEXT.md is absent", () => {
    const sessionDir = createPhaseSession("ctx missing");
    const out = openContext(sessionDir);
    expect(out).toContain("# CONTEXT.md");
    expect(out).toContain("(missing");
  });

  it("openContext returns an empty-state when CONTEXT.md is empty", () => {
    const sessionDir = createPhaseSession("ctx empty");
    fs.writeFileSync(path.join(sessionDir, "CONTEXT.md"), "   \n");
    const out = openContext(sessionDir);
    expect(out).toContain("# CONTEXT.md");
    expect(out).toContain("(empty)");
  });

  it("openContext previews CONTEXT.md content", () => {
    const sessionDir = createPhaseSession("ctx ok");
    fs.writeFileSync(
      path.join(sessionDir, "CONTEXT.md"),
      "## problem\n- refunds need 24h SLA\n",
    );
    const out = openContext(sessionDir);
    expect(out).toContain("# CONTEXT.md");
    expect(out).toContain("refunds need 24h SLA");
  });

  it("openPlan returns a missing-state when PLAN.md is absent", () => {
    const sessionDir = createPhaseSession("plan missing");
    expect(openPlan(sessionDir)).toContain("(missing");
  });

  it("openPlan previews PLAN.md content", () => {
    const sessionDir = createPhaseSession("plan ok");
    fs.writeFileSync(
      path.join(sessionDir, "PLAN.md"),
      "## approach\nincremental\n",
    );
    const out = openPlan(sessionDir);
    expect(out).toContain("# PLAN.md");
    expect(out).toContain("incremental");
  });

  it("openPlan clamps very large files", () => {
    const sessionDir = createPhaseSession("plan big");
    fs.writeFileSync(path.join(sessionDir, "PLAN.md"), "a".repeat(20_000));
    const out = openPlan(sessionDir);
    expect(out).toContain("…(truncated)");
    expect(out.length).toBeLessThan(5_000);
  });

  it("openSynthesis returns a missing-state when phase synthesis is absent", () => {
    const sessionDir = createPhaseSession("synth missing");
    const out = openSynthesis(sessionDir, "discuss");
    expect(out).toContain("# synthesis — discuss");
    expect(out).toContain("(missing");
  });

  it("openSynthesis previews phase synthesis content", () => {
    const sessionDir = createPhaseSession("synth ok");
    const phaseDir = path.join(sessionDir, "workers", "discuss");
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, "synthesis.md"),
      "consolidated decision A",
    );
    const out = openSynthesis(sessionDir, "discuss");
    expect(out).toContain("# synthesis — discuss");
    expect(out).toContain("consolidated decision A");
  });

  it("openWorkersIndex shows empty state when no phases have run", () => {
    const sessionDir = createPhaseSession("workers empty");
    // session creates an empty workers/ dir — index should still show empty.
    const out = openWorkersIndex(sessionDir);
    expect(out).toContain("# workers index");
    expect(out).toContain("(no worker output yet)");
  });

  it("openWorkersIndex lists per-phase worker files with sizes", () => {
    const sessionDir = createPhaseSession("workers populated");
    const discussDir = path.join(sessionDir, "workers", "discuss");
    const planDir = path.join(sessionDir, "workers", "plan");
    fs.mkdirSync(discussDir, { recursive: true });
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(path.join(discussDir, "ryze.md"), "abc");
    fs.writeFileSync(path.join(discussDir, "synthesis.md"), "z");
    fs.writeFileSync(path.join(planDir, "ornn.md"), "xy");

    const out = openWorkersIndex(sessionDir);
    expect(out).toContain("## discuss");
    expect(out).toContain("- ryze.md (3 bytes)");
    expect(out).toContain("- synthesis.md (1 bytes)");
    expect(out).toContain("## plan");
    expect(out).toContain("- ornn.md (2 bytes)");
    // The index never embeds file contents.
    expect(out).not.toContain("abc");
    expect(out).not.toContain("xy");
  });

  it("openWorkersIndex follows LOOM_PHASES order even when only later phases populated", () => {
    const sessionDir = createPhaseSession("workers ordered");
    const reflectDir = path.join(sessionDir, "workers", "reflect");
    const discussDir = path.join(sessionDir, "workers", "discuss");
    fs.mkdirSync(reflectDir, { recursive: true });
    fs.mkdirSync(discussDir, { recursive: true });
    fs.writeFileSync(path.join(reflectDir, "bard.md"), "r");
    fs.writeFileSync(path.join(discussDir, "ryze.md"), "d");

    const out = openWorkersIndex(sessionDir);
    const discussIdx = out.indexOf("## discuss");
    const reflectIdx = out.indexOf("## reflect");
    expect(discussIdx).toBeGreaterThan(-1);
    expect(reflectIdx).toBeGreaterThan(discussIdx);
  });
});

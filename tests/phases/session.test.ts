import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { setActiveWorkspace } from "../../src/workspace";
import {
  createPhaseSession,
  loadState,
  writeState,
  loadContext,
  writeContext,
  loadPlan,
  writePlan,
  listPhaseSessions,
  resolvePhaseSession,
  appendWorkerOutput,
  buildHandoff,
} from "../../src/phases/session";
import { PhaseState, SessionContext, PhasePlan } from "../../src/types";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-phase-"));
  originalWorkspace = process.cwd();
  setActiveWorkspace(tmp);
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("phases/session", () => {
  describe("createPhaseSession", () => {
    it("creates .loom/features/<slug>/ with STATE.md", () => {
      const dir = createPhaseSession("Add Dark Mode");
      expect(fs.existsSync(dir)).toBe(true);
      expect(path.basename(dir)).toBe("add-dark-mode");
      expect(fs.existsSync(path.join(dir, "STATE.md"))).toBe(true);
    });

    it("initial state starts at discuss with empty history except discuss", () => {
      const dir = createPhaseSession("foo");
      const state = loadState(dir);
      expect(state.feature).toBe("foo");
      expect(state.currentPhase).toBe("discuss");
      expect(state.history).toEqual(["discuss"]);
      expect(state.gates).toEqual([]);
    });

    it("rejects creating a duplicate session", () => {
      createPhaseSession("dup");
      expect(() => createPhaseSession("dup")).toThrow(/exists/);
    });

    it("slugifies titles with special chars", () => {
      const dir = createPhaseSession("Fix bug #42 (urgent!)");
      expect(path.basename(dir)).toBe("fix-bug-42-urgent");
    });

    it("rejects empty/whitespace-only title", () => {
      expect(() => createPhaseSession("")).toThrow(/feature/i);
      expect(() => createPhaseSession("   ")).toThrow(/feature/i);
    });
  });

  describe("STATE.md persistence", () => {
    it("writeState updates updatedAt and persists", () => {
      const dir = createPhaseSession("foo");
      const state = loadState(dir);
      state.currentPhase = "plan";
      state.history.push("plan");
      writeState(dir, state);
      const reloaded = loadState(dir);
      expect(reloaded.currentPhase).toBe("plan");
      expect(reloaded.history).toEqual(["discuss", "plan"]);
      expect(new Date(reloaded.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(state.createdAt).getTime(),
      );
    });
  });

  describe("CONTEXT.md persistence", () => {
    it("returns null when CONTEXT.md is missing", () => {
      const dir = createPhaseSession("foo");
      expect(loadContext(dir)).toBeNull();
    });

    it("writes and reads back CONTEXT.md", () => {
      const dir = createPhaseSession("foo");
      const ctx: SessionContext = {
        problem: "p",
        user: "u",
        glossary: [{ term: "t", definition: "d" }],
        decisions: ["dec"],
        nonGoals: ["ng"],
        openQuestions: ["q?"],
      };
      writeContext(dir, ctx);
      expect(loadContext(dir)).toEqual(ctx);
    });
  });

  describe("PLAN.md persistence", () => {
    it("returns null when PLAN.md is missing", () => {
      const dir = createPhaseSession("foo");
      expect(loadPlan(dir)).toBeNull();
    });

    it("writes and reads back PLAN.md", () => {
      const dir = createPhaseSession("foo");
      const plan: PhasePlan = {
        approach: "a",
        modules: ["src/x.ts"],
        acceptanceCriteria: ["AC1"],
        testPlan: [{ name: "t1", covers: ["AC1"] }],
        risks: [],
      };
      writePlan(dir, plan);
      expect(loadPlan(dir)).toEqual(plan);
    });
  });

  describe("worker outputs", () => {
    it("stores per-phase per-persona outputs", () => {
      const dir = createPhaseSession("foo");
      const path1 = appendWorkerOutput(dir, "discuss", "ryze", "first draft");
      expect(fs.existsSync(path1)).toBe(true);
      expect(fs.readFileSync(path1, "utf8")).toContain("first draft");
    });

    it("appends multiple runs of the same persona within a phase", () => {
      const dir = createPhaseSession("foo");
      appendWorkerOutput(dir, "build", "viktor", "first run");
      const second = appendWorkerOutput(dir, "build", "viktor", "second run");
      const body = fs.readFileSync(second, "utf8");
      expect(body).toContain("first run");
      expect(body).toContain("second run");
    });
  });

  describe("listing & resolution", () => {
    it("listPhaseSessions returns created sessions sorted", () => {
      createPhaseSession("a");
      createPhaseSession("b");
      const all = listPhaseSessions();
      expect(all.map((s) => path.basename(s))).toEqual(["a", "b"]);
    });

    it("resolvePhaseSession finds by slug or 'latest'", () => {
      createPhaseSession("a");
      const second = createPhaseSession("b");
      expect(resolvePhaseSession("a")).toContain("a");
      expect(resolvePhaseSession("latest")).toBe(second);
      expect(resolvePhaseSession("nope")).toBeNull();
    });
  });

  describe("buildHandoff", () => {
    it("packages state + context + plan + prior outputs for a target phase", () => {
      const dir = createPhaseSession("foo");
      const ctx: SessionContext = {
        problem: "p",
        user: "u",
        glossary: [],
        decisions: ["d1"],
        nonGoals: [],
        openQuestions: [],
      };
      writeContext(dir, ctx);
      appendWorkerOutput(dir, "discuss", "ryze", "ryze said something");
      const state = loadState(dir);
      state.currentPhase = "plan";
      state.history.push("plan");
      writeState(dir, state);

      const handoff = buildHandoff(dir, "plan");
      expect(handoff.feature).toBe("foo");
      expect(handoff.toPhase).toBe("plan");
      expect(handoff.fromPhase).toBe("discuss");
      expect(handoff.context).toEqual(ctx);
      expect(handoff.plan).toBeNull();
      expect(handoff.priorOutputs.discuss).toContain("ryze said something");
    });

    it("fromPhase is null at the start of discuss", () => {
      const dir = createPhaseSession("foo");
      const handoff = buildHandoff(dir, "discuss");
      expect(handoff.fromPhase).toBeNull();
      expect(handoff.priorOutputs).toEqual({});
    });
  });
});

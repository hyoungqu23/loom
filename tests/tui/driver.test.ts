import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFrameDriver } from "../../src/tui/driver.js";

class MockWriter {
  chunks: string[] = [];
  write(c: string): boolean {
    this.chunks.push(c);
    return true;
  }
  joined(): string {
    return this.chunks.join("");
  }
  reset(): void {
    this.chunks = [];
  }
}

describe("frameEnabled=false (non-TTY parity with pre-TUI Loom logs)", () => {
  let out: MockWriter;
  let now = 0;
  beforeEach(() => {
    out = new MockWriter();
    now = 1_000_000;
  });

  it("startPhase emits the existing '[loom] phase: ...' line verbatim", () => {
    const d = createFrameDriver({
      out: out as unknown as NodeJS.WritableStream,
      frameEnabled: false,
      colorMode: "none",
      asciiOnly: true,
      now: () => now,
      feature: "dark-mode",
    });
    d.startPhase("discuss", ["ryze", "zilean"]);
    expect(out.joined()).toBe("[loom] phase: discuss  personas: ryze, zilean\n");
  });

  it("workerDone preserves status= and optional signal= suffix", () => {
    const d = createFrameDriver({
      out: out as unknown as NodeJS.WritableStream,
      frameEnabled: false,
      colorMode: "none",
      asciiOnly: true,
      now: () => now,
    });
    d.workerDone("ryze", 0, null);
    d.workerDone("zilean", 1, "SIGTERM");
    expect(out.joined()).toBe(
      "[loom] done  ryze status=0\n" +
        "[loom] done  zilean status=1 signal=SIGTERM\n",
    );
  });

  it("workerError emits '[loom] error ...' with first line of reason", () => {
    const d = createFrameDriver({
      out: out as unknown as NodeJS.WritableStream,
      frameEnabled: false,
      colorMode: "none",
      asciiOnly: true,
      now: () => now,
    });
    d.workerError("ryze", "boom\nstack trace below\n  at foo");
    expect(out.joined()).toBe("[loom] error ryze boom\n");
  });

  it("endPhase, workerProgress are silent in plain mode (no aggregate lines existed before)", () => {
    const d = createFrameDriver({
      out: out as unknown as NodeJS.WritableStream,
      frameEnabled: false,
      colorMode: "none",
      asciiOnly: true,
      now: () => now,
    });
    d.workerProgress("ryze", 100);
    d.endPhase("discuss", {
      workers: 1,
      outBytes: 100,
      elapsedMs: 1000,
      failed: 0,
    });
    expect(out.joined()).toBe("");
  });

  it("log() passes the line through verbatim", () => {
    const d = createFrameDriver({
      out: out as unknown as NodeJS.WritableStream,
      frameEnabled: false,
      colorMode: "none",
      asciiOnly: true,
      now: () => now,
    });
    d.log("[loom] CONTEXT.md updated from 2 worker(s)");
    expect(out.joined()).toBe("[loom] CONTEXT.md updated from 2 worker(s)\n");
  });
});

describe("frameEnabled=true (TTY mode) — state mutation through public API", () => {
  let out: MockWriter;
  let now = 0;
  beforeEach(() => {
    out = new MockWriter();
    now = 0;
  });

  function makeDriver(scheduler?: {
    setInterval: (fn: () => void, ms: number) => () => void;
  }) {
    return createFrameDriver({
      out: out as unknown as NodeJS.WritableStream,
      frameEnabled: true,
      colorMode: "none",
      asciiOnly: false,
      now: () => now,
      scheduler,
      feature: "dark-mode",
      // bypass real timers in tests
      tickMs: 250,
    });
  }

  it("startPhase puts the phase in 'active' with one worker per persona", () => {
    const d = makeDriver({ setInterval: () => () => {} });
    now = 100;
    d.startPhase("discuss", ["ryze", "zilean"]);
    const state = d.__getState();
    const row = state.phases.find((p) => p.phase === "discuss")!;
    expect(row.status).toBe("active");
    if (row.status !== "active") throw new Error("type");
    expect(row.workers.map((w) => w.persona)).toEqual(["ryze", "zilean"]);
    expect(row.workers.every((w) => w.status === "running")).toBe(true);
    expect(row.workers.every((w) => w.outBytes === 0)).toBe(true);
  });

  it("workerProgress accumulates byte deltas on the matching worker", () => {
    const d = makeDriver({ setInterval: () => () => {} });
    d.startPhase("discuss", ["ryze"]);
    d.workerProgress("ryze", 100);
    d.workerProgress("ryze", 200);
    const state = d.__getState();
    const row = state.phases.find((p) => p.phase === "discuss")!;
    if (row.status !== "active") throw new Error("type");
    expect(row.workers[0].outBytes).toBe(300);
  });

  it("workerDone(0) marks worker 'done', non-zero marks 'failed'", () => {
    const d = makeDriver({ setInterval: () => () => {} });
    d.startPhase("discuss", ["ryze", "zilean"]);
    d.workerDone("ryze", 0, null);
    d.workerDone("zilean", 2, null);
    const state = d.__getState();
    const row = state.phases.find((p) => p.phase === "discuss")!;
    if (row.status !== "active") throw new Error("type");
    expect(row.workers[0].status).toBe("done");
    expect(row.workers[1].status).toBe("failed");
  });

  it("endPhase collapses the active row into a 'done' summary row", () => {
    const d = makeDriver({ setInterval: () => () => {} });
    now = 100;
    d.startPhase("discuss", ["ryze"]);
    now = 1_100;
    d.endPhase("discuss", {
      workers: 1,
      outBytes: 1_024,
      elapsedMs: 1_000,
      failed: 0,
    });
    const state = d.__getState();
    const row = state.phases.find((p) => p.phase === "discuss")!;
    expect(row.status).toBe("done");
    if (row.status !== "done") throw new Error("type");
    expect(row.outBytes).toBe(1_024);
    expect(row.elapsedMs).toBe(1_000);
    expect(row.failed).toBe(0);
    expect(row.personas).toBe(1);
  });

  it("tick scheduler advances state.tick on each interval fire", () => {
    let intervalFn: (() => void) | null = null;
    const scheduler = {
      setInterval: (fn: () => void, _ms: number): (() => void) => {
        intervalFn = fn;
        return () => {
          intervalFn = null;
        };
      },
    };
    const d = makeDriver(scheduler);
    d.startPhase("discuss", ["ryze"]);
    const before = d.__getState().tick;
    intervalFn!();
    intervalFn!();
    const after = d.__getState().tick;
    expect(after - before).toBe(2);
  });

  it("shutdown() stops the tick scheduler", () => {
    let cleared = false;
    const scheduler = {
      setInterval: (_fn: () => void, _ms: number): (() => void) => {
        return () => {
          cleared = true;
        };
      },
    };
    const d = makeDriver(scheduler);
    d.shutdown();
    expect(cleared).toBe(true);
  });

  it("renders the frame (via injected sink) on every state-changing call", () => {
    const d = makeDriver({ setInterval: () => () => {} });
    out.reset();
    d.startPhase("discuss", ["ryze"]);
    expect(out.joined()).toContain("⚬ discuss");
    expect(out.joined()).toContain("ryze");
  });

  it("log() in TTY mode prints above the frame and re-renders", () => {
    const d = makeDriver({ setInterval: () => () => {} });
    d.startPhase("discuss", ["ryze"]);
    out.reset();
    d.log("[loom] hello");
    const written = out.joined();
    expect(written).toContain("[loom] hello");
    // frame must appear after the log line
    const logIdx = written.indexOf("[loom] hello");
    const frameIdx = written.indexOf("⚬ discuss");
    expect(frameIdx).toBeGreaterThan(logIdx);
  });
});

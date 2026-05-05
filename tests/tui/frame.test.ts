import { describe, expect, it } from "vitest";
import { renderFrame, type RenderState, type PhaseRow } from "../../src/tui/frame.js";
import { LOOM_PHASES, type LoomPhase } from "../../src/types.js";

function queuedAll(): PhaseRow[] {
  return LOOM_PHASES.map<PhaseRow>((phase) => ({ phase, status: "queued" }));
}

function baseState(overrides: Partial<RenderState> = {}): RenderState {
  return {
    feature: "dark-mode",
    phases: queuedAll(),
    now: 0,
    tick: 0,
    asciiOnly: false,
    colorMode: "none",
    nextGateEtaMs: null,
    ...overrides,
  };
}

function setPhase(rows: PhaseRow[], phase: LoomPhase, row: PhaseRow): PhaseRow[] {
  return rows.map((r) => (r.phase === phase ? row : r));
}

describe("renderFrame — final frozen state (designed first)", () => {
  it("renders all 7 phases done with a receipt summary line", () => {
    const phases: PhaseRow[] = [
      { phase: "discuss", status: "done", personas: 2, outBytes: 2_400, elapsedMs: 42_000, failed: 0 },
      { phase: "plan", status: "done", personas: 2, outBytes: 3_174, elapsedMs: 68_000, failed: 0 },
      { phase: "build", status: "done", personas: 3, outBytes: 8_396, elapsedMs: 134_000, failed: 0 },
      { phase: "review", status: "done", personas: 2, outBytes: 1_945, elapsedMs: 55_000, failed: 0 },
      { phase: "verify", status: "done", personas: 1, outBytes: 410, elapsedMs: 18_000, failed: 0 },
      { phase: "ship", status: "done", personas: 1, outBytes: 614, elapsedMs: 22_000, failed: 0 },
      { phase: "reflect", status: "done", personas: 1, outBytes: 1_126, elapsedMs: 30_000, failed: 0 },
    ];
    const lines = renderFrame(baseState({ phases, now: 369_000 }));
    expect(lines).toEqual([
      "loom · dark-mode",
      "  ✓ discuss   2 personas   2.3 KB out   0:42",
      "  ✓ plan      2 personas   3.1 KB out   1:08",
      "  ✓ build     3 personas   8.2 KB out   2:14",
      "  ✓ review    2 personas   1.9 KB out   0:55",
      "  ✓ verify    1 persona    410 B out    0:18",
      "  ✓ ship      1 persona    614 B out    0:22",
      "  ✓ reflect   1 persona    1.1 KB out   0:30",
      "",
      "  done in 6:09   17.6 KB out",
    ]);
  });
});

describe("renderFrame — empty/initial state", () => {
  it("shows header + 7 queued rows + blank + status hint", () => {
    const lines = renderFrame(baseState());
    expect(lines[0]).toBe("loom · dark-mode");
    expect(lines.slice(1, 8)).toEqual([
      "  · discuss   queued",
      "  · plan      queued",
      "  · build     queued",
      "  · review    queued",
      "  · verify    queued",
      "  · ship      queued",
      "  · reflect   queued",
    ]);
    expect(lines[8]).toBe("");
    expect(lines[9]).toBe("  starting…");
  });
});

describe("renderFrame — active phase with running workers (mockup parity)", () => {
  it("matches the design doc mockup", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "discuss", {
      phase: "discuss",
      status: "done",
      personas: 2,
      outBytes: 2_400,
      elapsedMs: 42_000,
      failed: 0,
    });
    phases = setPhase(phases, "plan", {
      phase: "plan",
      status: "done",
      personas: 2,
      outBytes: 3_174,
      elapsedMs: 68_000,
      failed: 0,
    });
    phases = setPhase(phases, "build", {
      phase: "build",
      status: "active",
      startedAt: 110_000,
      workers: [
        { persona: "ryze", startedAt: 110_000, outBytes: 312, status: "running" },
        { persona: "zilean", startedAt: 114_000, outBytes: 198, status: "running" },
      ],
    });
    const lines = renderFrame(
      baseState({
        phases,
        now: 148_000, // ryze elapsed=0:38, zilean=0:34
        tick: 0,
        nextGateEtaMs: 30_000,
      }),
    );
    expect(lines).toEqual([
      "loom · dark-mode",
      "  ✓ discuss   2 personas   2.3 KB out   0:42",
      "  ✓ plan      2 personas   3.1 KB out   1:08",
      "  ⚬ build",
      "      ryze    ◐ 0:38  +312 B",
      "      zilean  ◐ 0:34  +198 B",
      "  · review    queued",
      "  · verify    queued",
      "  · ship      queued",
      "  · reflect   queued",
      "",
      "  next gate ~30s",
    ]);
  });

  it("alternates pulse glyph by tick parity", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "discuss", {
      phase: "discuss",
      status: "active",
      startedAt: 0,
      workers: [{ persona: "ryze", startedAt: 0, outBytes: 100, status: "running" }],
    });
    const stateA = baseState({ phases, tick: 0, now: 1_000 });
    const stateB = baseState({ phases, tick: 1, now: 1_000 });
    const a = renderFrame(stateA);
    const b = renderFrame(stateB);
    expect(a).not.toEqual(b);
    // exactly one line differs (the worker row)
    const diff = a.filter((line, i) => line !== b[i]);
    expect(diff.length).toBe(1);
  });

  it("shows queued phase header without worker block when active phase has no workers yet", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "discuss", {
      phase: "discuss",
      status: "active",
      startedAt: 0,
      workers: [],
    });
    const lines = renderFrame(baseState({ phases, now: 500 }));
    expect(lines).toContain("  ⚬ discuss");
    // no worker rows
    expect(lines.find((l) => l.startsWith("      "))).toBeUndefined();
  });
});

describe("renderFrame — failed worker / failed phase", () => {
  it("marks a worker that exited non-zero with the failed icon", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "review", {
      phase: "review",
      status: "active",
      startedAt: 0,
      workers: [
        { persona: "ryze", startedAt: 0, outBytes: 500, status: "failed" },
      ],
    });
    const lines = renderFrame(baseState({ phases, now: 5_000 }));
    expect(lines.some((l) => l.includes("ryze") && l.includes("✗"))).toBe(true);
  });

  it("uses ✗ icon and ' N failed' suffix on a phase with failures", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "review", {
      phase: "review",
      status: "done",
      personas: 2,
      outBytes: 1_945,
      elapsedMs: 55_000,
      failed: 1,
    });
    const lines = renderFrame(baseState({ phases }));
    const reviewLine = lines.find((l) => l.includes("review"))!;
    expect(reviewLine).toContain("✗");
    expect(reviewLine).toContain("1 failed");
  });
});

describe("renderFrame — ASCII fallback", () => {
  it("substitutes ASCII glyphs for unicode when asciiOnly=true", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "discuss", {
      phase: "discuss",
      status: "done",
      personas: 1,
      outBytes: 100,
      elapsedMs: 1_000,
      failed: 0,
    });
    phases = setPhase(phases, "plan", {
      phase: "plan",
      status: "active",
      startedAt: 0,
      workers: [{ persona: "ryze", startedAt: 0, outBytes: 50, status: "running" }],
    });
    const lines = renderFrame(
      baseState({ phases, asciiOnly: true, now: 5_000, tick: 0 }),
    );
    expect(lines.some((l) => l.includes("·") || l.includes("⚬") || l.includes("✓"))).toBe(false);
    expect(lines.find((l) => l.includes("discuss"))).toMatch(/\+/);
    expect(lines.find((l) => l.includes("ryze"))).toMatch(/[*o]/);
  });
});

describe("renderFrame — color mode", () => {
  it("colorMode='ansi' emits SGR sequences around glyphs", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "discuss", {
      phase: "discuss",
      status: "done",
      personas: 1,
      outBytes: 100,
      elapsedMs: 1_000,
      failed: 0,
    });
    const lines = renderFrame(baseState({ phases, colorMode: "ansi" }));
    const discussLine = lines.find((l) => l.includes("discuss"))!;
    expect(discussLine).toContain("\x1b[32m"); // green for ✓
  });

  it("colorMode='none' emits no escape sequences", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "discuss", {
      phase: "discuss",
      status: "done",
      personas: 1,
      outBytes: 100,
      elapsedMs: 1_000,
      failed: 0,
    });
    const lines = renderFrame(baseState({ phases, colorMode: "none" }));
    for (const l of lines) {
      expect(l).not.toContain("\x1b[");
    }
  });
});

describe("renderFrame — terminal reason footer", () => {
  it("terminal='aborted' on partial run shows 'aborted at <last_done>' with bytes/elapsed", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "discuss", {
      phase: "discuss",
      status: "done",
      personas: 1,
      outBytes: 40,
      elapsedMs: 22_000,
      failed: 1,
    });
    const lines = renderFrame(baseState({ phases, terminal: "aborted" }));
    const last = lines[lines.length - 1];
    expect(last).toContain("aborted");
    expect(last).toContain("at discuss");
    expect(last).toContain("40 B out");
    expect(last).toContain("0:22");
  });

  it("terminal='aborted' before any phase done falls back to first phase name", () => {
    const lines = renderFrame(baseState({ terminal: "aborted" }));
    const last = lines[lines.length - 1];
    expect(last).toContain("aborted at discuss");
  });

  it("terminal='completed' shows 'done in <total>  <bytes>'", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "discuss", {
      phase: "discuss",
      status: "done",
      personas: 1,
      outBytes: 1_024,
      elapsedMs: 30_000,
      failed: 0,
    });
    phases = setPhase(phases, "plan", {
      phase: "plan",
      status: "done",
      personas: 1,
      outBytes: 2_048,
      elapsedMs: 60_000,
      failed: 0,
    });
    const lines = renderFrame(baseState({ phases, terminal: "completed" }));
    const last = lines[lines.length - 1];
    expect(last).toContain("done in 1:30");
    expect(last).toContain("3.0 KB out");
  });
});

describe("renderFrame — bytes/persona singular vs plural", () => {
  it("uses singular 'persona' for 1, plural 'personas' for >1", () => {
    let phases = queuedAll();
    phases = setPhase(phases, "discuss", {
      phase: "discuss",
      status: "done",
      personas: 1,
      outBytes: 100,
      elapsedMs: 1_000,
      failed: 0,
    });
    phases = setPhase(phases, "plan", {
      phase: "plan",
      status: "done",
      personas: 3,
      outBytes: 200,
      elapsedMs: 2_000,
      failed: 0,
    });
    const lines = renderFrame(baseState({ phases }));
    expect(lines.find((l) => l.includes("discuss"))).toMatch(/1 persona\b/);
    expect(lines.find((l) => l.includes("plan"))).toMatch(/3 personas/);
  });
});

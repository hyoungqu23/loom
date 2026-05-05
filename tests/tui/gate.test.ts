import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGateProvider } from "../../src/tui/gate.js";

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

function fakeReadline(answer: string) {
  return {
    question: (_q: string) => Promise.resolve(answer),
    close: vi.fn(),
  };
}

function fakeDriver() {
  return {
    pauseFrame: vi.fn(),
    resumeFrame: vi.fn(),
    log: vi.fn(),
  };
}

describe("createGateProvider — decision parsing", () => {
  it.each([
    ["proceed", "proceed"],
    ["p", "proceed"],
    ["", "proceed"], // default
    ["PROCEED", "proceed"], // case-insensitive
    ["revise", "revise"],
    ["r", "revise"],
    ["abort", "abort"],
    ["a", "abort"],
  ])("answer %s → decision %s", async (input, expected) => {
    const driver = fakeDriver();
    const gate = createGateProvider({
      colorMode: "none",
      asciiOnly: true,
      driver: driver as any,
      readline: () => fakeReadline(input) as any,
    });
    const out = await gate({
      phase: "discuss",
      workersCount: 2,
      synthesisExcerpt: "synth",
    });
    expect(out.decision).toBe(expected);
  });
});

describe("createGateProvider — output content", () => {
  it("includes phase name and worker count in the header", async () => {
    const driver = fakeDriver();
    const gate = createGateProvider({
      colorMode: "none",
      asciiOnly: true,
      driver: driver as any,
      readline: () => fakeReadline("proceed") as any,
    });
    await gate({ phase: "discuss", workersCount: 2, synthesisExcerpt: "syn" });
    const log = driver.log.mock.calls.map((c) => c[0]).join("\n");
    expect(log).toContain("discuss");
    expect(log).toContain("workers=2");
  });

  it("uses 800 chars for the synthesis preview (up from 600)", async () => {
    const driver = fakeDriver();
    const long = "x".repeat(2000);
    const gate = createGateProvider({
      colorMode: "none",
      asciiOnly: true,
      driver: driver as any,
      readline: () => fakeReadline("proceed") as any,
    });
    await gate({ phase: "discuss", workersCount: 1, synthesisExcerpt: long });
    const log = driver.log.mock.calls.map((c) => c[0]).join("\n");
    const xs = (log.match(/x+/g) || [])[0] ?? "";
    expect(xs.length).toBe(800);
  });

  it("skips the synthesis section when excerpt is empty", async () => {
    const driver = fakeDriver();
    const gate = createGateProvider({
      colorMode: "none",
      asciiOnly: true,
      driver: driver as any,
      readline: () => fakeReadline("proceed") as any,
    });
    await gate({ phase: "discuss", workersCount: 1, synthesisExcerpt: "" });
    const log = driver.log.mock.calls.map((c) => c[0]).join("\n");
    expect(log).not.toContain("Synthesis preview");
  });
});

describe("createGateProvider — color mode", () => {
  it("colorMode='ansi' colors the header (yellow border ⇒ SGR 33)", async () => {
    const driver = fakeDriver();
    const gate = createGateProvider({
      colorMode: "ansi",
      asciiOnly: false,
      driver: driver as any,
      readline: () => fakeReadline("proceed") as any,
    });
    await gate({ phase: "discuss", workersCount: 1, synthesisExcerpt: "syn" });
    const joined = driver.log.mock.calls.map((c) => c[0]).join("\n");
    expect(joined).toContain("\x1b[33m"); // yellow
  });

  it("colorMode='none' emits no escape sequences", async () => {
    const driver = fakeDriver();
    const gate = createGateProvider({
      colorMode: "none",
      asciiOnly: true,
      driver: driver as any,
      readline: () => fakeReadline("proceed") as any,
    });
    await gate({ phase: "discuss", workersCount: 1, synthesisExcerpt: "syn" });
    const joined = driver.log.mock.calls.map((c) => c[0]).join("\n");
    expect(joined).not.toContain("\x1b[");
  });
});

describe("createGateProvider — driver bracketing", () => {
  it("pauses the live frame before prompting and resumes after", async () => {
    const driver = fakeDriver();
    const order: string[] = [];
    driver.pauseFrame.mockImplementation(() => order.push("pause"));
    driver.resumeFrame.mockImplementation(() => order.push("resume"));
    const gate = createGateProvider({
      colorMode: "none",
      asciiOnly: true,
      driver: driver as any,
      readline: () => {
        order.push("ask");
        return fakeReadline("proceed") as any;
      },
    });
    await gate({ phase: "discuss", workersCount: 1, synthesisExcerpt: "syn" });
    expect(order).toEqual(["pause", "ask", "resume"]);
  });
});

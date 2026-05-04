import { describe, expect, it } from "vitest";
import { createAnsi, ESC } from "../../src/tui/ansi";

describe("createAnsi(mode='ansi')", () => {
  const a = createAnsi("ansi");

  it("wraps green with SGR 32 + reset", () => {
    expect(a.green("ok")).toBe(`${ESC}[32mok${ESC}[0m`);
  });

  it("wraps cyan with SGR 36", () => {
    expect(a.cyan("x")).toBe(`${ESC}[36mx${ESC}[0m`);
  });

  it("wraps red with SGR 31", () => {
    expect(a.red("x")).toBe(`${ESC}[31mx${ESC}[0m`);
  });

  it("wraps yellow with SGR 33", () => {
    expect(a.yellow("x")).toBe(`${ESC}[33mx${ESC}[0m`);
  });

  it("wraps dim with SGR 2", () => {
    expect(a.dim("x")).toBe(`${ESC}[2mx${ESC}[0m`);
  });

  it("wraps bold with SGR 1", () => {
    expect(a.bold("x")).toBe(`${ESC}[1mx${ESC}[0m`);
  });

  it("returns input unchanged when wrapping empty string", () => {
    expect(a.green("")).toBe(`${ESC}[32m${ESC}[0m`);
  });
});

describe("createAnsi(mode='none')", () => {
  const a = createAnsi("none");

  it.each([
    ["green", "ok"],
    ["cyan", "ok"],
    ["red", "ok"],
    ["yellow", "ok"],
    ["dim", "ok"],
    ["bold", "ok"],
  ] as const)("color '%s' is identity in 'none' mode", (name, input) => {
    expect(a[name](input)).toBe(input);
  });
});

describe("cursor primitives (always raw ANSI — only used in TTY mode)", () => {
  const a = createAnsi("ansi");
  const b = createAnsi("none");

  it("cursorUp(n) emits CSI nF (move to col 1, n lines up)", () => {
    expect(a.cursorUp(3)).toBe(`${ESC}[3F`);
    expect(b.cursorUp(3)).toBe(`${ESC}[3F`);
  });

  it("cursorUp(0) is empty (no-op)", () => {
    expect(a.cursorUp(0)).toBe("");
  });

  it("clearLine erases entire line", () => {
    expect(a.clearLine).toBe(`${ESC}[2K`);
    expect(b.clearLine).toBe(`${ESC}[2K`);
  });

  it("hideCursor / showCursor emit DEC private mode 25", () => {
    expect(a.hideCursor).toBe(`${ESC}[?25l`);
    expect(a.showCursor).toBe(`${ESC}[?25h`);
  });
});

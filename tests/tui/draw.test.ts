import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDrawSurface } from "../../src/tui/draw.js";
import { ESC } from "../../src/tui/ansi.js";

class MockWriter {
  chunks: string[] = [];
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
  joined(): string {
    return this.chunks.join("");
  }
  reset(): void {
    this.chunks = [];
  }
}

describe("createDrawSurface", () => {
  let out: MockWriter;
  beforeEach(() => {
    out = new MockWriter();
  });

  it("first render writes lines joined by \\n with trailing newline", () => {
    const s = createDrawSurface(out as unknown as NodeJS.WritableStream);
    s.render(["a", "b", "c"]);
    expect(out.joined()).toBe("a\nb\nc\n");
  });

  it("second render moves cursor up to the previous block and erases below before re-writing", () => {
    const s = createDrawSurface(out as unknown as NodeJS.WritableStream);
    s.render(["a", "b", "c"]);
    out.reset();
    s.render(["x", "y"]);
    // cursor up 3 (prev line count) + erase below + new lines
    expect(out.joined()).toBe(`${ESC}[3F${ESC}[J` + "x\ny\n");
  });

  it("clear() cursors up and erases without re-writing", () => {
    const s = createDrawSurface(out as unknown as NodeJS.WritableStream);
    s.render(["a", "b"]);
    out.reset();
    s.clear();
    expect(out.joined()).toBe(`${ESC}[2F${ESC}[J`);
  });

  it("clear() before any render is a no-op", () => {
    const s = createDrawSurface(out as unknown as NodeJS.WritableStream);
    s.clear();
    expect(out.joined()).toBe("");
  });

  it("rendering empty array is a no-op (does not move cursor on first call)", () => {
    const s = createDrawSurface(out as unknown as NodeJS.WritableStream);
    s.render([]);
    expect(out.joined()).toBe("");
  });

  it("done() leaves the rendered block in place — no subsequent writes occur on render after done()", () => {
    const s = createDrawSurface(out as unknown as NodeJS.WritableStream);
    s.render(["a"]);
    s.done();
    out.reset();
    s.render(["b"]); // ignored after done
    expect(out.joined()).toBe("");
  });

  it("after handleResize(), next render does NOT move cursor up — terminal reflow may have moved everything", () => {
    const s = createDrawSurface(out as unknown as NodeJS.WritableStream);
    s.render(["a", "b"]);
    out.reset();
    s.handleResize(); // simulate SIGWINCH
    s.render(["c"]);
    expect(out.joined()).toBe("c\n");
  });

  it("clear() after a render reaches a clean state — a follow-up render acts like first render", () => {
    const s = createDrawSurface(out as unknown as NodeJS.WritableStream);
    s.render(["a", "b"]);
    s.clear();
    out.reset();
    s.render(["x", "y", "z"]);
    expect(out.joined()).toBe("x\ny\nz\n");
  });
});

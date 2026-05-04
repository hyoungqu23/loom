import { beforeEach, describe, expect, it } from "vitest";
import { createFrameSink, createPlainSink } from "../../src/tui/sink";
import { ESC } from "../../src/tui/ansi";

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

describe("createPlainSink", () => {
  let out: MockWriter;
  beforeEach(() => {
    out = new MockWriter();
  });

  it("log() writes the line + newline", () => {
    const sink = createPlainSink(out as unknown as NodeJS.WritableStream);
    sink.log("hello");
    sink.log("world");
    expect(out.joined()).toBe("hello\nworld\n");
  });

  it("refresh() is a no-op", () => {
    const sink = createPlainSink(out as unknown as NodeJS.WritableStream);
    sink.refresh();
    expect(out.joined()).toBe("");
  });

  it("finalize() is a no-op", () => {
    const sink = createPlainSink(out as unknown as NodeJS.WritableStream);
    sink.finalize();
    expect(out.joined()).toBe("");
  });
});

describe("createFrameSink", () => {
  let out: MockWriter;
  let frameLines: string[];
  beforeEach(() => {
    out = new MockWriter();
    frameLines = ["frame1", "frame2"];
  });

  it("refresh() renders the frame from getLines()", () => {
    const sink = createFrameSink(
      out as unknown as NodeJS.WritableStream,
      () => frameLines,
    );
    sink.refresh();
    expect(out.joined()).toBe("frame1\nframe2\n");
  });

  it("log() prints the line ABOVE a re-rendered frame", () => {
    const sink = createFrameSink(
      out as unknown as NodeJS.WritableStream,
      () => frameLines,
    );
    sink.refresh(); // initial frame
    out.reset();
    sink.log("[loom] hello");
    // 1) cursor up + erase the prior frame, 2) print log line, 3) re-render frame
    expect(out.joined()).toBe(
      `${ESC}[2F${ESC}[J` + "[loom] hello\n" + "frame1\nframe2\n",
    );
  });

  it("log() before any refresh just prints the line and lays a fresh frame after", () => {
    const sink = createFrameSink(
      out as unknown as NodeJS.WritableStream,
      () => frameLines,
    );
    sink.log("[loom] first");
    expect(out.joined()).toBe("[loom] first\n" + "frame1\nframe2\n");
  });

  it("subsequent refresh() updates the frame in place", () => {
    const sink = createFrameSink(
      out as unknown as NodeJS.WritableStream,
      () => frameLines,
    );
    sink.refresh();
    out.reset();
    frameLines = ["alpha", "beta", "gamma"];
    sink.refresh();
    expect(out.joined()).toBe(
      `${ESC}[2F${ESC}[J` + "alpha\nbeta\ngamma\n",
    );
  });

  it("pause() clears the frame and routes log() directly to out without re-rendering", () => {
    const sink = createFrameSink(
      out as unknown as NodeJS.WritableStream,
      () => frameLines,
    );
    sink.refresh(); // initial frame
    out.reset();
    sink.pause();
    // pause() should clear the prior frame (cursor up + erase)
    expect(out.joined()).toBe(`${ESC}[2F${ESC}[J`);
    out.reset();
    sink.log("synth line 1");
    sink.log("synth line 2 with\nembedded newlines\nstuff");
    // No surface clear, no frame re-render — just the log lines + newline
    expect(out.joined()).toBe(
      "synth line 1\n" + "synth line 2 with\nembedded newlines\nstuff\n",
    );
    out.reset();
    sink.refresh(); // refresh should be no-op while paused
    expect(out.joined()).toBe("");
  });

  it("resume() re-renders the frame fresh at the current cursor (no cursor-up)", () => {
    const sink = createFrameSink(
      out as unknown as NodeJS.WritableStream,
      () => frameLines,
    );
    sink.refresh();
    sink.pause();
    sink.log("interim text");
    out.reset();
    sink.resume();
    // No cursor-up because handleResize was called before render
    expect(out.joined()).toBe("frame1\nframe2\n");
  });

  it("pause() is idempotent and resume() before pause is a no-op", () => {
    const sink = createFrameSink(
      out as unknown as NodeJS.WritableStream,
      () => frameLines,
    );
    sink.resume(); // before any pause — nothing happens
    expect(out.joined()).toBe("");
    sink.refresh();
    sink.pause();
    out.reset();
    sink.pause(); // second pause — already paused, no-op
    expect(out.joined()).toBe("");
  });

  it("finalize() does one last render then stops responding to refresh", () => {
    const sink = createFrameSink(
      out as unknown as NodeJS.WritableStream,
      () => frameLines,
    );
    sink.refresh();
    out.reset();
    frameLines = ["final"];
    sink.finalize();
    const afterFinalize = out.joined();
    out.reset();
    frameLines = ["should not appear"];
    sink.refresh();
    expect(out.joined()).toBe(""); // refresh ignored
    // finalize itself wrote the final frame
    expect(afterFinalize).toContain("final");
  });
});

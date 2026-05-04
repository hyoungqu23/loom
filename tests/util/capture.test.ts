import { describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture";

describe("captureConsole", () => {
  it("returns the value produced by the wrapped function", async () => {
    const out: string[] = [];
    const value = await captureConsole(out, () => 42);
    expect(value).toBe(42);
  });

  it("captures console.log output line-by-line into the buffer", async () => {
    const out: string[] = [];
    await captureConsole(out, () => {
      console.log("hello");
      console.log("world");
    });
    expect(out).toEqual(["hello", "world"]);
  });

  it("captures console.error output into the same buffer", async () => {
    const out: string[] = [];
    await captureConsole(out, () => {
      console.error("oops");
    });
    expect(out).toEqual(["oops"]);
  });

  it("joins multiple arguments with a single space", async () => {
    const out: string[] = [];
    await captureConsole(out, () => {
      console.log("a", "b", "c");
    });
    expect(out).toEqual(["a b c"]);
  });

  it("stringifies non-string console arguments via String()", async () => {
    const out: string[] = [];
    await captureConsole(out, () => {
      console.log(42, true, null, undefined);
    });
    expect(out).toEqual(["42 true null undefined"]);
  });

  it("restores the original console after fn completes", async () => {
    const original = console.log;
    await captureConsole([], () => {
      console.log("captured");
    });
    expect(console.log).toBe(original);
  });

  it("restores the original console even if fn throws", async () => {
    const original = console.log;
    await expect(
      captureConsole([], () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(console.log).toBe(original);
  });

  it("supports async fn and awaits its resolution", async () => {
    const out: string[] = [];
    const value = await captureConsole(out, async () => {
      console.log("before");
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      console.log("after");
      return "done";
    });
    expect(value).toBe("done");
    expect(out).toEqual(["before", "after"]);
  });
});

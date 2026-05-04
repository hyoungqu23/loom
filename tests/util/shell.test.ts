import { afterEach, describe, expect, it } from "vitest";
import {
  clearCommandCheckCache,
  commandExists,
  shellQuote,
} from "../../src/util/shell";

afterEach(() => {
  clearCommandCheckCache();
});

describe("shellQuote", () => {
  it("wraps a plain string in single quotes", () => {
    expect(shellQuote("foo")).toBe("'foo'");
  });

  it("escapes embedded single quotes via the standard '\\'' trick", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("preserves spaces without re-encoding them", () => {
    expect(shellQuote("hello world")).toBe("'hello world'");
  });

  it("preserves shell metacharacters (which are inert inside single quotes)", () => {
    expect(shellQuote("$(whoami)")).toBe("'$(whoami)'");
  });
});

describe("commandExists", () => {
  it("reports ok=true for a command that exists on PATH", () => {
    // `sh` is part of POSIX and is present on every supported dev/CI host.
    const check = commandExists("sh");
    expect(check.ok).toBe(true);
    expect(check.path).toMatch(/sh$/);
  });

  it("reports ok=false for a clearly non-existent command", () => {
    const check = commandExists("loom-nonexistent-binary-xyz-12345");
    expect(check.ok).toBe(false);
    expect(check.path).toBe("");
  });

  it("memoises the lookup so repeat calls do not re-spawn", () => {
    const first = commandExists("sh");
    const second = commandExists("sh");
    // Same object reference proves the cache served the second call.
    expect(second).toBe(first);
  });

  it("clearCommandCheckCache forces a fresh lookup", () => {
    const first = commandExists("sh");
    clearCommandCheckCache();
    const second = commandExists("sh");
    expect(second).not.toBe(first);
    expect(second.ok).toBe(true);
  });
});

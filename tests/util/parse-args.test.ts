import { describe, expect, it } from "vitest";
import {
  flagBool,
  flagNumber,
  flagString,
  parseArgs,
} from "../../src/util/parse-args";

describe("parseArgs", () => {
  it("returns empty positionals and flags for empty argv", () => {
    expect(parseArgs([])).toEqual({ positionals: [], flags: {} });
  });

  it("collects positional arguments in order", () => {
    expect(parseArgs(["init", "more"])).toEqual({
      positionals: ["init", "more"],
      flags: {},
    });
  });

  it("treats --key value as a string flag", () => {
    expect(parseArgs(["--model", "opus"]).flags).toEqual({ model: "opus" });
  });

  it("supports --key=value form", () => {
    expect(parseArgs(["--model=opus"]).flags).toEqual({ model: "opus" });
  });

  it("treats whitelisted boolean flags as true without consuming the next token", () => {
    const parsed = parseArgs(["--dry-run", "task-name"]);
    expect(parsed.flags).toEqual({ "dry-run": true });
    expect(parsed.positionals).toEqual(["task-name"]);
  });

  it("coerces --boolean-flag=false on whitelist to actual boolean false", () => {
    expect(parseArgs(["--dry-run=false"]).flags).toEqual({ "dry-run": false });
  });

  it("coerces --boolean-flag=true on whitelist to actual boolean true", () => {
    expect(parseArgs(["--smoke=true"]).flags).toEqual({ smoke: true });
  });

  it("does NOT consume the next token for whitelisted boolean flags", () => {
    const parsed = parseArgs(["--smoke", "--model", "opus"]);
    expect(parsed.flags).toEqual({ smoke: true, model: "opus" });
  });

  it("treats --non-interactive as a boolean flag", () => {
    const parsed = parseArgs(["autopilot", "--non-interactive", "--gate", "auto-proceed"]);
    expect(parsed.flags).toEqual({
      "non-interactive": true,
      gate: "auto-proceed",
    });
  });

  it("treats --include-secondary as a boolean flag", () => {
    const parsed = parseArgs(["phase", "--include-secondary", "task-name"]);
    expect(parsed.flags).toEqual({ "include-secondary": true });
    expect(parsed.positionals).toEqual(["phase", "task-name"]);
  });

  it("treats non-whitelisted --flag without value as boolean true at end of argv", () => {
    expect(parseArgs(["--verbose"]).flags).toEqual({ verbose: true });
  });

  it("treats non-whitelisted --flag followed by another --flag as boolean true", () => {
    expect(parseArgs(["--verbose", "--model", "opus"]).flags).toEqual({
      verbose: true,
      model: "opus",
    });
  });

  it("interleaves positionals and flags", () => {
    const parsed = parseArgs([
      "team",
      "--agents",
      "kayle,bard",
      "--dry-run",
      "Plan task",
    ]);
    expect(parsed.positionals).toEqual(["team", "Plan task"]);
    expect(parsed.flags).toEqual({
      agents: "kayle,bard",
      "dry-run": true,
    });
  });

  it("coerces --foo=true literally as string when not on whitelist", () => {
    // Non-whitelisted flags get string-coerced "true"/"false" only via the
    // explicit equals form, which we choose to coerce for ergonomics.
    expect(parseArgs(["--model=true"]).flags).toEqual({ model: true });
  });
});

describe("flagBool", () => {
  it("returns fallback when value is undefined", () => {
    expect(flagBool(undefined)).toBe(false);
    expect(flagBool(undefined, true)).toBe(true);
  });

  it("returns boolean values directly", () => {
    expect(flagBool(true)).toBe(true);
    expect(flagBool(false)).toBe(false);
  });

  it("treats 'false' / '0' / '' as false", () => {
    expect(flagBool("false")).toBe(false);
    expect(flagBool("0")).toBe(false);
    expect(flagBool("")).toBe(false);
  });

  it("treats other strings as true", () => {
    expect(flagBool("true")).toBe(true);
    expect(flagBool("yes")).toBe(true);
    expect(flagBool("1")).toBe(true);
  });

  it("treats non-zero numbers as true and 0 as false", () => {
    expect(flagBool(1)).toBe(true);
    expect(flagBool(42)).toBe(true);
    expect(flagBool(0)).toBe(false);
  });
});

describe("flagString", () => {
  it("returns fallback when value is undefined", () => {
    expect(flagString(undefined)).toBe("");
    expect(flagString(undefined, "default")).toBe("default");
  });

  it("returns string values directly", () => {
    expect(flagString("hello")).toBe("hello");
  });

  it("stringifies numeric values", () => {
    expect(flagString(42)).toBe("42");
  });

  it("returns fallback for boolean values", () => {
    expect(flagString(true, "fallback")).toBe("fallback");
    expect(flagString(false, "fallback")).toBe("fallback");
  });
});

describe("flagNumber", () => {
  it("returns fallback when value is undefined", () => {
    expect(flagNumber(undefined, 7)).toBe(7);
  });

  it("returns numeric values directly", () => {
    expect(flagNumber(42, 0)).toBe(42);
  });

  it("parses numeric strings", () => {
    expect(flagNumber("42", 0)).toBe(42);
    expect(flagNumber("-3.5", 0)).toBe(-3.5);
  });

  it("returns fallback for non-numeric strings", () => {
    expect(flagNumber("abc", 7)).toBe(7);
  });

  it("returns fallback for boolean values", () => {
    expect(flagNumber(true, 7)).toBe(7);
    expect(flagNumber(false, 7)).toBe(7);
  });
});

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readJson,
  readJsonRequired,
  writeJson,
} from "../../src/util/json.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-json-test-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("writeJson", () => {
  it("writes pretty-printed JSON with a trailing newline", () => {
    const file = path.join(tmp, "out.json");
    writeJson(file, { a: 1, b: [2, 3] });
    const content = fs.readFileSync(file, "utf8");
    expect(content).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n');
  });

  it("overwrites existing files", () => {
    const file = path.join(tmp, "out.json");
    writeJson(file, { a: 1 });
    writeJson(file, { b: 2 });
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ b: 2 });
  });
});

describe("readJson", () => {
  it("returns fallback when file is missing", () => {
    const fallback = { default: true };
    expect(readJson(path.join(tmp, "missing.json"), fallback)).toEqual(
      fallback,
    );
  });

  it("returns parsed value when file exists", () => {
    const file = path.join(tmp, "data.json");
    fs.writeFileSync(file, JSON.stringify({ value: 42 }));
    expect(readJson(file, { value: 0 })).toEqual({ value: 42 });
  });

  it("returns fallback when file contents are malformed JSON", () => {
    const file = path.join(tmp, "bad.json");
    fs.writeFileSync(file, "{not json");
    expect(readJson(file, { fallback: true })).toEqual({ fallback: true });
  });
});

describe("readJsonRequired", () => {
  it("returns parsed value when file exists", () => {
    const file = path.join(tmp, "required.json");
    fs.writeFileSync(file, JSON.stringify({ x: 1 }));
    expect(readJsonRequired<{ x: number }>(file)).toEqual({ x: 1 });
  });

  it("throws an ENOENT-style error when file is missing", () => {
    // Specific matcher: rules out generic stub errors so RED is real.
    expect(() =>
      readJsonRequired(path.join(tmp, "missing.json")),
    ).toThrow(/ENOENT|no such file/i);
  });

  it("throws a JSON syntax error when file contents are malformed", () => {
    const file = path.join(tmp, "bad.json");
    fs.writeFileSync(file, "{not json");
    expect(() => readJsonRequired(file)).toThrow(/JSON|Unexpected token/i);
  });
});

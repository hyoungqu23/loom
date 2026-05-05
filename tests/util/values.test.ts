import { describe, expect, it } from "vitest";
import {
  deepMerge,
  getNestedValue,
  isJsonObject,
  JsonObject,
  normalizeConfigPath,
  parseConfigValue,
  setNestedValue,
} from "../../src/util/values.js";

describe("isJsonObject", () => {
  it("accepts plain objects", () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject({ a: 1 })).toBe(true);
  });

  it("rejects null", () => {
    expect(isJsonObject(null)).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject([1, 2])).toBe(false);
  });

  it("rejects primitives", () => {
    expect(isJsonObject("hello")).toBe(false);
    expect(isJsonObject(42)).toBe(false);
    expect(isJsonObject(true)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isJsonObject(undefined)).toBe(false);
  });
});

describe("deepMerge", () => {
  it("returns base unchanged when override is not an object", () => {
    const base: JsonObject = { a: 1 };
    expect(deepMerge(base, "string-value")).toEqual({ a: 1 });
    expect(deepMerge(base, 42)).toEqual({ a: 1 });
    expect(deepMerge(base, null)).toEqual({ a: 1 });
    expect(deepMerge(base, [1, 2])).toEqual({ a: 1 });
  });

  it("does not mutate the base object", () => {
    const base: JsonObject = { a: 1 };
    deepMerge(base, { b: 2 });
    expect(base).toEqual({ a: 1 });
  });

  it("adds new top-level keys from override", () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("overrides primitives at top level", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("recursively merges nested objects", () => {
    expect(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 99, z: 3 } })).toEqual({
      a: { x: 1, y: 99, z: 3 },
    });
  });

  it("replaces arrays rather than concatenating", () => {
    expect(deepMerge({ a: [1, 2, 3] }, { a: [9] })).toEqual({ a: [9] });
  });

  it("replaces object with non-object when override is non-object", () => {
    expect(deepMerge({ a: { x: 1 } }, { a: "raw" })).toEqual({ a: "raw" });
  });

  it("skips forbidden keys from override", () => {
    const merged = deepMerge({ safe: 1 }, JSON.parse('{"__proto__":{"x":"y"}}'));
    expect(merged).toEqual({ safe: 1 });
    expect(({} as { x?: string }).x).toBeUndefined();
  });
});

describe("parseConfigValue", () => {
  it("parses 'true' / 'false' / 'null'", () => {
    expect(parseConfigValue("true")).toBe(true);
    expect(parseConfigValue("false")).toBe(false);
    expect(parseConfigValue("null")).toBe(null);
  });

  it("parses integers", () => {
    expect(parseConfigValue("42")).toBe(42);
    expect(parseConfigValue("-7")).toBe(-7);
  });

  it("parses decimals", () => {
    expect(parseConfigValue("-3.5")).toBe(-3.5);
  });

  it("parses JSON object literals", () => {
    expect(parseConfigValue('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON array literals", () => {
    expect(parseConfigValue("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("returns raw string for non-JSON / non-numeric values", () => {
    expect(parseConfigValue("hello")).toBe("hello");
    expect(parseConfigValue("42abc")).toBe("42abc");
  });

  it("returns raw string when JSON parse fails", () => {
    expect(parseConfigValue("{invalid json")).toBe("{invalid json");
  });
});

describe("getNestedValue", () => {
  it("returns the object itself for empty path", () => {
    const obj: JsonObject = { a: 1 };
    expect(getNestedValue(obj, "")).toEqual(obj);
  });

  it("returns top-level value", () => {
    expect(getNestedValue({ a: 1 }, "a")).toBe(1);
  });

  it("returns nested value via dotted path", () => {
    expect(getNestedValue({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("returns undefined for missing path", () => {
    expect(getNestedValue({ a: 1 }, "x.y")).toBeUndefined();
  });

  it("returns undefined when traversing through a primitive", () => {
    expect(getNestedValue({ a: 1 }, "a.b")).toBeUndefined();
  });

  it("returns undefined when traversing through an array", () => {
    expect(getNestedValue({ a: [1, 2] }, "a.b")).toBeUndefined();
  });
});

describe("setNestedValue", () => {
  it("sets a top-level value", () => {
    const obj: JsonObject = {};
    setNestedValue(obj, "a", 1);
    expect(obj).toEqual({ a: 1 });
  });

  it("creates nested objects as needed", () => {
    const obj: JsonObject = {};
    setNestedValue(obj, "a.b.c", 42);
    expect(obj).toEqual({ a: { b: { c: 42 } } });
  });

  it("preserves siblings while writing nested value", () => {
    const obj: JsonObject = { a: { existing: "x" } };
    setNestedValue(obj, "a.b", 1);
    expect(obj).toEqual({ a: { existing: "x", b: 1 } });
  });

  it("replaces non-object intermediate value with a fresh object", () => {
    const obj: JsonObject = { a: 1 };
    setNestedValue(obj, "a.b", 2);
    expect(obj).toEqual({ a: { b: 2 } });
  });

  it("throws when path is empty", () => {
    expect(() => setNestedValue({}, "", 1)).toThrow(/required/i);
  });

  it("throws when any path segment is forbidden", () => {
    expect(() => setNestedValue({}, "safe.__proto__.polluted", "x")).toThrow(
      /forbidden config path segment: __proto__/i,
    );
    expect(() => setNestedValue({}, "safe.constructor.value", "x")).toThrow(
      /forbidden config path segment: constructor/i,
    );
  });

  it("does not pollute Object.prototype", () => {
    expect(() => setNestedValue({}, "__proto__.polluted", "x")).toThrow(
      /forbidden config path segment: __proto__/i,
    );
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });

  it("does not walk inherited intermediate objects", () => {
    const inherited = { a: { inherited: true } };
    const obj = Object.create(inherited) as JsonObject;
    setNestedValue(obj, "a.local", 1);
    expect(obj).toEqual({ a: { local: 1 } });
    expect(inherited.a).toEqual({ inherited: true });
  });
});

describe("normalizeConfigPath", () => {
  it("rewrites singular 'agent.' to plural 'agents.'", () => {
    expect(normalizeConfigPath("agent.opus")).toBe("agents.opus");
  });

  it("rewrites singular 'runtime.' to plural 'runtimes.'", () => {
    expect(normalizeConfigPath("runtime.codex")).toBe("runtimes.codex");
  });

  it("leaves already-plural prefixes unchanged", () => {
    expect(normalizeConfigPath("agents.opus")).toBe("agents.opus");
    expect(normalizeConfigPath("runtimes.codex")).toBe("runtimes.codex");
  });

  it("leaves unrelated paths unchanged", () => {
    expect(normalizeConfigPath("memory.enabled")).toBe("memory.enabled");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeConfigPath("")).toBe("");
  });
});

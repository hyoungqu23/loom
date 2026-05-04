/**
 * JSON-shaped value types. Everything that comes from the filesystem or
 * the CLI should be modelled as JsonValue first, then validated/converted
 * to a concrete domain type by the caller via explicit variable typing.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export function isJsonObject(
  value: JsonValue | undefined,
): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Keys that, when copied through `deepMerge` or walked by `setNestedValue`,
 * would mutate `Object.prototype` or the prototype chain of a fresh literal.
 * Treat as injection vectors — JSON parsed from disk or CLI args must not be
 * able to set them.
 */
const FORBIDDEN_PROTO_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function isForbiddenConfigSegment(key: string): boolean {
  return FORBIDDEN_PROTO_KEYS.has(key);
}

function copyJsonObject(source: JsonObject): JsonObject {
  const target: JsonObject = {};
  for (const key of Object.keys(source)) {
    if (isForbiddenConfigSegment(key)) continue;
    target[key] = source[key];
  }
  return target;
}

/** Recursively merge `override` into `base`. Arrays are replaced, not merged. */
export function deepMerge(base: JsonObject, override: JsonValue): JsonObject {
  if (!isJsonObject(override)) return copyJsonObject(base);
  const out: JsonObject = copyJsonObject(base);
  for (const key of Object.keys(override)) {
    if (isForbiddenConfigSegment(key)) continue;
    const overrideValue = override[key];
    const baseValue = out[key];
    if (isJsonObject(overrideValue) && isJsonObject(baseValue)) {
      out[key] = deepMerge(baseValue, overrideValue);
    } else {
      out[key] = overrideValue;
    }
  }
  return out;
}

/** Coerce a string CLI value into a JSON value when it parses unambiguously. */
export function parseConfigValue(raw: string): JsonValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const trimmed = raw.trim();
  if (/^[\[{]/.test(trimmed)) {
    try {
      const parsed: JsonValue = JSON.parse(raw);
      return parsed;
    } catch {
      return raw;
    }
  }
  return raw;
}

export function getNestedValue(
  object: JsonObject,
  dottedPath: string,
): JsonValue | undefined {
  if (!dottedPath) return object;
  const parts = dottedPath.split(".").filter(Boolean);
  // Symmetry with setNestedValue: refuse to traverse into prototype-pollution
  // sentinel keys. Reads can't pollute, but exposing inherited Object.prototype
  // members via `loom config show __proto__.toString` is surprising and noisy.
  for (const part of parts) {
    if (isForbiddenConfigSegment(part)) return undefined;
  }
  let current: JsonValue = object;
  for (const part of parts) {
    if (!isJsonObject(current)) return undefined;
    const next: JsonValue | undefined = Object.hasOwn(current, part)
      ? current[part]
      : undefined;
    if (next === undefined) return undefined;
    current = next;
  }
  return current;
}

export function setNestedValue(
  object: JsonObject,
  dottedPath: string,
  value: JsonValue,
): void {
  const parts = dottedPath.split(".").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Config path is required");
  }
  for (const part of parts) {
    if (isForbiddenConfigSegment(part)) {
      throw new Error(`Forbidden config path segment: ${part}`);
    }
  }
  let current: JsonObject = object;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const existing = Object.hasOwn(current, part) ? current[part] : undefined;
    if (!isJsonObject(existing)) {
      const next: JsonObject = {};
      current[part] = next;
      current = next;
    } else {
      current = existing;
    }
  }
  current[parts[parts.length - 1]] = value;
}

export function normalizeConfigPath(dottedPath: string): string {
  return String(dottedPath || "")
    .replace(/^agent\./, "agents.")
    .replace(/^runtime\./, "runtimes.");
}

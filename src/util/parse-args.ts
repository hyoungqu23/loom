import { FlagValue, ParsedArgs } from "../types.js";

/**
 * Flags that never take a value. They become boolean true when present and
 * never consume the following token. Keeps `--dry-run path/to/x` from
 * accidentally turning `dry-run` into a string.
 */
const BOOLEAN_FLAGS: ReadonlySet<string> = new Set([
  "help",
  "force",
  "dry-run",
  "smoke",
  "failed",
  "include-secondary",
  "non-interactive",
  "no-interactive",
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: { [key: string]: FlagValue } = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const body = token.slice(2);
    const equalsIndex = body.indexOf("=");
    if (equalsIndex >= 0) {
      const key = body.slice(0, equalsIndex);
      const raw = body.slice(equalsIndex + 1);
      flags[key] = coerceFlagValue(key, raw);
      continue;
    }

    const key = body;
    if (BOOLEAN_FLAGS.has(key)) {
      flags[key] = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }

  return { positionals, flags };
}

function coerceFlagValue(key: string, raw: string): FlagValue {
  if (BOOLEAN_FLAGS.has(key)) {
    return raw !== "false" && raw !== "0";
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

export function flagBool(
  value: FlagValue | undefined,
  fallback = false,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === "false" || value === "0" || value === "") return false;
  return true;
}

export function flagString(
  value: FlagValue | undefined,
  fallback = "",
): string {
  if (value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

export function flagNumber(
  value: FlagValue | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

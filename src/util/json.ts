import * as fs from "fs";
import { writeFileAtomic } from "./atomic-write.js";

export function writeJson(filePath: string, value: object): void {
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Reads a JSON file and returns the parsed value typed as T.
 * Falls back to `fallback` if the file is missing or malformed.
 *
 * Note: JSON shape is trusted here. Callers should validate the returned
 * structure when the source is user-supplied.
 */
export function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const parsed: T = JSON.parse(content);
    return parsed;
  } catch {
    return fallback;
  }
}

/** Like readJson but throws when the file is missing or malformed. */
export function readJsonRequired<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf8");
  const parsed: T = JSON.parse(content);
  return parsed;
}

import * as fs from "fs";
import * as path from "path";

export type WalkOptions = {
  /** Maximum number of files collected. Defaults to 5000. */
  maxFiles?: number;
  /** Maximum directory depth (root = 0). Defaults to 10. */
  maxDepth?: number;
};

const DEFAULT_OPTIONS: Required<WalkOptions> = {
  maxFiles: 5000,
  maxDepth: 10,
};

/**
 * Synchronously walk `dir`, returning every file matching `predicate`.
 * Skips symlinks to avoid cycles.
 */
export function walkFiles(
  dir: string,
  predicate: (entry: fs.Dirent, fullPath: string) => boolean,
  options: WalkOptions = {},
): string[] {
  const { maxFiles, maxDepth } = { ...DEFAULT_OPTIONS, ...options };
  const out: string[] = [];

  function walk(current: string, depth: number): void {
    if (depth > maxDepth) return;
    if (out.length >= maxFiles) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && predicate(entry, fullPath)) {
        out.push(fullPath);
      }
    }
  }

  walk(dir, 0);
  return out;
}

export function collectMarkdownFiles(dir: string): string[] {
  return walkFiles(dir, (entry) => entry.name.endsWith(".md")).sort();
}

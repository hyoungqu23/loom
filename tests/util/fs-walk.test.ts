import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectMarkdownFiles,
  walkFiles,
} from "../../src/util/fs-walk.js";

let tmp: string;

function touch(...segments: string[]): string {
  const file = path.join(tmp, ...segments);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "");
  return file;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-walk-test-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("walkFiles", () => {
  it("returns an empty array for a non-existent directory", () => {
    expect(walkFiles(path.join(tmp, "missing"), () => true)).toEqual([]);
  });

  it("returns an empty array when no file satisfies the predicate", () => {
    touch("a.txt");
    touch("b.txt");
    expect(walkFiles(tmp, () => false)).toEqual([]);
  });

  it("collects every file in a flat directory", () => {
    touch("a.txt");
    touch("b.txt");
    const out = walkFiles(tmp, () => true);
    expect(out.sort()).toEqual([
      path.join(tmp, "a.txt"),
      path.join(tmp, "b.txt"),
    ]);
  });

  it("recurses into subdirectories", () => {
    touch("nested", "deep", "leaf.md");
    expect(walkFiles(tmp, (entry) => entry.name.endsWith(".md"))).toEqual([
      path.join(tmp, "nested", "deep", "leaf.md"),
    ]);
  });

  it("stops descending past maxDepth", () => {
    touch("level1", "level2", "level3", "deep.txt");
    const out = walkFiles(tmp, () => true, { maxDepth: 1 });
    expect(out).toEqual([]);
  });

  it("stops collecting once maxFiles is reached", () => {
    touch("a.txt");
    touch("b.txt");
    touch("c.txt");
    const out = walkFiles(tmp, () => true, { maxFiles: 2 });
    expect(out).toHaveLength(2);
  });

  it("skips symlinks to avoid cycles", () => {
    touch("real.txt");
    fs.symlinkSync(tmp, path.join(tmp, "loop"));
    const out = walkFiles(tmp, () => true);
    expect(out).toEqual([path.join(tmp, "real.txt")]);
  });

  it("forwards directory entry and full path to the predicate", () => {
    touch("nested", "leaf.md");
    const seen: string[] = [];
    walkFiles(tmp, (entry, fullPath) => {
      seen.push(`${entry.name}@${fullPath}`);
      return true;
    });
    expect(seen).toEqual([`leaf.md@${path.join(tmp, "nested", "leaf.md")}`]);
  });
});

describe("collectMarkdownFiles", () => {
  it("returns only .md files", () => {
    touch("a.md");
    touch("b.txt");
    touch("nested", "c.md");
    expect(collectMarkdownFiles(tmp)).toEqual([
      path.join(tmp, "a.md"),
      path.join(tmp, "nested", "c.md"),
    ]);
  });

  it("returns results sorted lexicographically", () => {
    touch("z.md");
    touch("a.md");
    touch("m.md");
    expect(collectMarkdownFiles(tmp)).toEqual([
      path.join(tmp, "a.md"),
      path.join(tmp, "m.md"),
      path.join(tmp, "z.md"),
    ]);
  });
});

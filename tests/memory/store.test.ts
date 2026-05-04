import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";
import {
  ensureMemoryStore,
  loadMemoryFile,
  memoryRoot,
} from "../../src/memory/store";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-memory-"));
  setActiveWorkspace(tmp);
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("memory store", () => {
  it("creates separate user, project, procedure, and candidate memory areas", () => {
    ensureMemoryStore();

    expect(fs.existsSync(path.join(memoryRoot(), "user.md"))).toBe(true);
    expect(fs.existsSync(path.join(memoryRoot(), "project.md"))).toBe(true);
    expect(fs.statSync(path.join(memoryRoot(), "procedures")).isDirectory()).toBe(
      true,
    );
    expect(fs.statSync(path.join(memoryRoot(), "candidates")).isDirectory()).toBe(
      true,
    );
    expect(fs.statSync(path.join(memoryRoot(), "archive")).isDirectory()).toBe(
      true,
    );
  });

  it("parses memory entries with source, confidence, updatedAt, and tags", () => {
    ensureWorkspaceState();
    fs.mkdirSync(memoryRoot(), { recursive: true });
    fs.writeFileSync(
      path.join(memoryRoot(), "user.md"),
      [
        "# User Memory",
        "",
        "<!-- loom-memory",
        "source: reflect:add-auth",
        "confidence: medium",
        "updatedAt: 2026-05-04T00:00:00.000Z",
        "tags: language, commits",
        "-->",
        "- Always respond in Korean.",
        "",
      ].join("\n"),
      "utf8",
    );

    const entries = loadMemoryFile("user");

    expect(entries).toEqual([
      {
        kind: "user",
        source: "reflect:add-auth",
        confidence: "medium",
        updatedAt: "2026-05-04T00:00:00.000Z",
        tags: ["language", "commits"],
        body: "- Always respond in Korean.",
      },
    ]);
  });
});

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMemoryCommand } from "../../src/commands/memory.js";
import { captureConsole } from "../../src/util/capture.js";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace.js";
import { memoryRoot } from "../../src/memory/store.js";
import { createPhaseSession, writeContext } from "../../src/phases/session.js";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-memory-command-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeCandidate(id: string, kind = "user"): void {
  const dir = path.join(memoryRoot(), "candidates");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${id}.md`),
    [
      "---",
      `kind: ${kind}`,
      "source: reflect:test",
      "confidence: medium",
      "updatedAt: 2026-05-04T00:00:00.000Z",
      "tags: reflect, preference",
      "---",
      "",
      "Always respond in Korean.",
      "",
    ].join("\n"),
    "utf8",
  );
}

describe("runMemoryCommand", () => {
  it("lists pending memory candidates", async () => {
    writeCandidate("cand-1", "user");

    const buf: string[] = [];
    await captureConsole(buf, () => runMemoryCommand(["list"], {}));

    const text = buf.join("\n");
    expect(text).toContain("Memory Candidates");
    expect(text).toContain("cand-1");
    expect(text).toContain("user");
  });

  it("promotes a candidate into user memory and removes the pending file", () => {
    writeCandidate("cand-2", "user");

    runMemoryCommand(["promote", "cand-2"], { type: "user" });

    const userMemory = fs.readFileSync(path.join(memoryRoot(), "user.md"), "utf8");
    expect(userMemory).toContain("source: reflect:test");
    expect(userMemory).toContain("Always respond in Korean.");
    expect(fs.existsSync(path.join(memoryRoot(), "candidates", "cand-2.md"))).toBe(
      false,
    );
  });

  it("rejects a candidate into archive", () => {
    writeCandidate("cand-3", "project");

    runMemoryCommand(["reject", "cand-3"], {});

    expect(fs.existsSync(path.join(memoryRoot(), "candidates", "cand-3.md"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(memoryRoot(), "archive", "cand-3.md"))).toBe(
      true,
    );
  });

  it("searches prior feature sessions", async () => {
    const dir = createPhaseSession("auth cleanup");
    writeContext(dir, {
      problem: "Magic link login is failing for invited users.",
      user: "operators",
      glossary: [],
      decisions: ["Improve invitation auth copy"],
      nonGoals: [],
      openQuestions: [],
    });

    const buf: string[] = [];
    await captureConsole(buf, () => runMemoryCommand(["search", "magic link"], {}));

    const text = buf.join("\n");
    expect(text).toContain("Session Search");
    expect(text).toContain("auth-cleanup");
    expect(text).toContain("Magic link login");
  });
});

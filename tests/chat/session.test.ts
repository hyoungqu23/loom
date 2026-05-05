import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  createPhaseSession,
  loadState,
  resolvePhaseSession,
} from "../../src/phases/session";
import { serializeState } from "../../src/phases/serialize";
import { getActiveWorkspace, setActiveWorkspace } from "../../src/workspace";
import {
  mostRecentChatSession,
  resolveChatSession,
} from "../../src/chat/session";

let tmp: string;
let originalWorkspace: string;

function setUpdatedAt(sessionDir: string, updatedAt: string): void {
  const state = loadState(sessionDir);
  fs.writeFileSync(
    path.join(sessionDir, "STATE.md"),
    serializeState({ ...state, updatedAt }),
    "utf8",
  );
}

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-chat-session-"));
  setActiveWorkspace(tmp);
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("chat/session", () => {
  it("selects the most recently updated session by STATE.md updatedAt", () => {
    const zulu = createPhaseSession("zulu");
    const alpha = createPhaseSession("alpha");
    setUpdatedAt(zulu, "2026-05-04T00:00:00.000Z");
    setUpdatedAt(alpha, "2026-05-05T00:00:00.000Z");

    expect(path.basename(resolvePhaseSession("latest") as string)).toBe("zulu");
    expect(path.basename(mostRecentChatSession() as string)).toBe("alpha");
  });

  it("falls back to directory mtime when STATE.md is malformed", () => {
    const oldDir = createPhaseSession("old");
    const brokenDir = createPhaseSession("broken");
    setUpdatedAt(oldDir, "2026-05-04T00:00:00.000Z");
    fs.writeFileSync(path.join(brokenDir, "STATE.md"), "not frontmatter", "utf8");

    const oldTime = new Date("2026-05-04T00:00:00.000Z");
    const newTime = new Date("2026-05-05T00:00:00.000Z");
    fs.utimesSync(oldDir, oldTime, oldTime);
    fs.utimesSync(brokenDir, newTime, newTime);

    expect(path.basename(mostRecentChatSession() as string)).toBe("broken");
  });

  it("resolves an explicit existing feature", () => {
    const sessionDir = createPhaseSession("existing feature");

    const resolved = resolveChatSession({ feature: "existing-feature" });

    expect(resolved).toEqual({ sessionDir, created: false });
  });

  it("creates a missing explicit feature when requested", () => {
    const resolved = resolveChatSession({
      feature: "New Feature",
      createIfMissing: true,
    });

    expect(resolved?.created).toBe(true);
    expect(path.basename(resolved?.sessionDir || "")).toBe("new-feature");
  });
});

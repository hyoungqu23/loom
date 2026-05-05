import * as fs from "fs";
import {
  createPhaseSession,
  listPhaseSessions,
  loadState,
  resolvePhaseSession,
} from "../phases/session";

export type ChatSessionResolution = {
  sessionDir: string;
  created: boolean;
};

function sessionSortTime(sessionDir: string): number {
  try {
    const updatedAt = loadState(sessionDir).updatedAt;
    const time = new Date(updatedAt).getTime();
    if (Number.isFinite(time)) return time;
  } catch {
    // Fall back below for sessions with hand-edited or missing STATE.md.
  }
  try {
    return fs.statSync(sessionDir).mtimeMs;
  } catch {
    return 0;
  }
}

export function mostRecentChatSession(): string | null {
  const sessions = listPhaseSessions();
  if (sessions.length === 0) return null;
  return sessions
    .map((sessionDir) => ({ sessionDir, time: sessionSortTime(sessionDir) }))
    .sort(
      (a, b) =>
        b.time - a.time || a.sessionDir.localeCompare(b.sessionDir),
    )[0].sessionDir;
}

export function resolveChatSession(opts: {
  feature?: string;
  createIfMissing?: boolean;
}): ChatSessionResolution | null {
  const feature = opts.feature || "";
  if (!feature) {
    const sessionDir = mostRecentChatSession();
    return sessionDir ? { sessionDir, created: false } : null;
  }

  const existing = resolvePhaseSession(feature);
  if (existing) return { sessionDir: existing, created: false };

  if (!opts.createIfMissing) return null;
  return { sessionDir: createPhaseSession(feature), created: true };
}

import * as path from "path";
import { InteractiveChat } from "./Interactive.js";
import { readChatArtifactFlags } from "./artifacts.js";
import { loadInkModules, InkModules } from "./ink.js";
import { createInitialChatState } from "./state.js";
import { resolveChatSession } from "./session.js";
import { loadState } from "../phases/session.js";
import { ChatSnapshot, TranscriptMessage } from "./transcript.js";

export type StartChatOptions = {
  feature?: string;
  loadInk?: () => Promise<InkModules>;
};

export async function startChat(opts: StartChatOptions = {}): Promise<void> {
  const resolved = resolveChatSession({
    feature: opts.feature,
    createIfMissing: Boolean(opts.feature),
  });
  if (!resolved) {
    throw new Error(
      "No Loom sessions found. Start with loom chat --feature <name>.",
    );
  }

  const state = loadState(resolved.sessionDir);
  const artifacts = readChatArtifactFlags(resolved.sessionDir);
  const chatState = createInitialChatState({
    sessionDir: resolved.sessionDir,
    feature: state.feature,
    currentPhase: state.currentPhase,
    hasContext: artifacts.hasContext,
    hasPlan: artifacts.hasPlan,
  });
  const modules = await (opts.loadInk ?? loadInkModules)();
  const messageText = resolved.created
    ? `session created: ${state.feature}`
    : `session opened: ${path.basename(resolved.sessionDir)}`;
  const initialTranscript: TranscriptMessage[] = [
    { type: "system", text: messageText },
  ];
  const initialSnapshot: ChatSnapshot = {
    state: chatState,
    transcript: initialTranscript,
    detail: "",
  };

  // Hold onto the Ink render instance so we can await its exit.
  // Without waitUntilExit() the startChat promise resolves
  // immediately and main() falls off the end while Ink still owns
  // stdin in raw mode — the process happens to stay alive but
  // shutdown ordering is implicit. Await keeps Ctrl+C / /quit clean.
  const instance = modules.render(
    modules.createElement(InteractiveChat, { initialSnapshot }),
  );
  if (instance && typeof instance.waitUntilExit === "function") {
    await instance.waitUntilExit();
  }
}

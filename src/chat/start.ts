import * as path from "path";
import { ChatApp } from "./App";
import { loadInkModules, InkModules } from "./ink";
import { createInitialChatState } from "./state";
import { resolveChatSession } from "./session";
import { loadState } from "../phases/session";

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
    throw new Error("No Loom sessions found. Start with loom chat --feature <name>.");
  }

  const state = loadState(resolved.sessionDir);
  const chatState = createInitialChatState({
    sessionDir: resolved.sessionDir,
    feature: state.feature,
    currentPhase: state.currentPhase,
  });
  const modules = await (opts.loadInk ?? loadInkModules)();
  const messageText = resolved.created
    ? `session created: ${state.feature}`
    : `session opened: ${path.basename(resolved.sessionDir)}`;

  modules.render(
    modules.React.createElement(ChatApp, {
      state: chatState,
      messages: [{ type: "system", text: messageText }],
      detail: "Synthesis will appear here after a phase run.",
      input: "",
    }),
  );
}

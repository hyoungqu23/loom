import * as path from "path";
import { InteractiveChat } from "./Interactive";
import { loadInkModules, InkModules } from "./ink";
import { createInitialChatState } from "./state";
import { resolveChatSession } from "./session";
import { loadState } from "../phases/session";
import { TranscriptMessage } from "./transcript";

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
  const chatState = createInitialChatState({
    sessionDir: resolved.sessionDir,
    feature: state.feature,
    currentPhase: state.currentPhase,
  });
  const modules = await (opts.loadInk ?? loadInkModules)();
  const messageText = resolved.created
    ? `session created: ${state.feature}`
    : `session opened: ${path.basename(resolved.sessionDir)}`;
  const initialTranscript: TranscriptMessage[] = [
    { type: "system", text: messageText },
  ];

  modules.render(
    modules.React.createElement(InteractiveChat, {
      initialState: chatState,
      initialTranscript,
    }),
  );
}

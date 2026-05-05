import { parseChatInput } from "./commands";
import { executeChatCommand } from "./runtime";
import { ChatState } from "./state";
import {
  appendParsedInputToTranscript,
  appendRuntimeMessagesToTranscript,
  Transcript,
  TranscriptMessage,
} from "./transcript";

export type ChatInputResult = {
  state: ChatState;
  transcript: Transcript;
};

export type ChatInputOptions = {
  onTranscript?: (transcript: Transcript) => void;
};

export async function handleChatInput(
  state: ChatState,
  transcript: Transcript,
  input: string,
  opts: ChatInputOptions = {},
): Promise<ChatInputResult> {
  const parsed = parseChatInput(input);
  let liveTranscript = appendParsedInputToTranscript(transcript, parsed);

  if (parsed.kind !== "command") {
    return { state, transcript: liveTranscript };
  }

  const execution = await executeChatCommand(
    state,
    parsed.command,
    opts.onTranscript
      ? {
          onMessage: (message) => {
            const next = appendRuntimeMessagesToTranscript([], [message])[0];
            if (!next) return;
            liveTranscript = [...liveTranscript, next as TranscriptMessage];
            opts.onTranscript?.(liveTranscript);
          },
        }
      : {},
  );
  return {
    state: execution.state,
    transcript:
      opts.onTranscript
        ? liveTranscript
        : appendRuntimeMessagesToTranscript(
            liveTranscript,
            execution.messages,
          ),
  };
}

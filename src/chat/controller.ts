import { parseChatInput } from "./commands";
import { executeChatCommand } from "./runtime";
import { ChatState, chatReducer } from "./state";
import { buildPhaseDetail } from "./detail";
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
  let nextState = execution.state;
  if (execution.phaseResult) {
    const detail = buildPhaseDetail(
      nextState.sessionDir,
      execution.phaseResult.phase,
      execution.phaseResult.workers,
    );
    nextState = chatReducer(nextState, { type: "set-detail", detail });
  }
  return {
    state: nextState,
    transcript:
      opts.onTranscript
        ? liveTranscript
        : appendRuntimeMessagesToTranscript(
            liveTranscript,
            execution.messages,
          ),
  };
}

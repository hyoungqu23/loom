import { parseChatInput } from "./commands.js";
import { executeChatCommand } from "./runtime.js";
import { ChatState, chatReducer } from "./state.js";
import { buildPhaseDetail } from "./detail.js";
import {
  appendParsedInputToTranscript,
  appendRuntimeMessagesToTranscript,
  Transcript,
  TranscriptMessage,
} from "./transcript.js";

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

  let execution;
  try {
    execution = await executeChatCommand(
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
  } catch (error) {
    // Convert any thrown runtime error (spawn failure, runtime
    // misconfigured, etc.) into an in-transcript error message so the
    // chat session can keep going. State is left untouched on failure
    // so the user can retry without losing prior progress.
    const message = error instanceof Error ? error.message : String(error);
    const errored: TranscriptMessage = {
      type: "error",
      text: `chat error: ${message}`,
    };
    const updated = [...liveTranscript, errored];
    if (opts.onTranscript) opts.onTranscript(updated);
    return { state, transcript: updated };
  }
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

import { parseChatInput } from "./commands.js";
import { executeChatCommand } from "./runtime.js";
import { buildPhaseDetail } from "./detail.js";
import {
  appendParsedInputToTranscript,
  appendRuntimeMessagesToTranscript,
  ChatSnapshot,
  Transcript,
  TranscriptMessage,
} from "./transcript.js";

/** Result of a single chat input round-trip. Same shape as ChatSnapshot. */
export type ChatInputResult = ChatSnapshot;

export type ChatInputOptions = {
  onTranscript?: (transcript: Transcript) => void;
};

/**
 * Pure controller: takes a snapshot + a single user input line and
 * returns the next snapshot. Errors thrown by executeChatCommand are
 * captured into the transcript so the chat session keeps going.
 *
 * The detail panel is updated in priority order:
 *   1. explicit `execution.detail` (`/open <target>`),
 *   2. derived from `phaseResult` via buildPhaseDetail (synthesis-first),
 *   3. carried forward unchanged from the input snapshot.
 */
export async function handleChatInput(
  snapshot: ChatSnapshot,
  input: string,
  opts: ChatInputOptions = {},
): Promise<ChatInputResult> {
  const parsed = parseChatInput(input);
  let liveTranscript = appendParsedInputToTranscript(
    snapshot.transcript,
    parsed,
  );

  if (parsed.kind !== "command") {
    return { ...snapshot, transcript: liveTranscript };
  }

  let execution;
  try {
    execution = await executeChatCommand(
      snapshot.state,
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
    const message = error instanceof Error ? error.message : String(error);
    const errored: TranscriptMessage = {
      type: "error",
      text: `chat error: ${message}`,
    };
    const updated = [...liveTranscript, errored];
    if (opts.onTranscript) opts.onTranscript(updated);
    return { ...snapshot, transcript: updated };
  }

  let nextDetail = snapshot.detail;
  if (execution.detail !== undefined) {
    nextDetail = execution.detail;
  } else if (execution.phaseResult) {
    nextDetail = buildPhaseDetail(
      execution.state.sessionDir,
      execution.phaseResult.phase,
      execution.phaseResult.workers,
    );
  }

  return {
    state: execution.state,
    transcript: opts.onTranscript
      ? liveTranscript
      : appendRuntimeMessagesToTranscript(liveTranscript, execution.messages),
    detail: nextDetail,
  };
}

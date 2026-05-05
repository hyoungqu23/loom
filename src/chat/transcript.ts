import { ChatParseResult } from "./commands.js";
import { ChatRuntimeMessage } from "./runtime.js";
import type { ChatState } from "./state.js";
import { TRANSCRIPT_MAX } from "./constants.js";

export type TranscriptMessage = {
  type: "user" | "system" | "error" | "gate";
  text: string;
};

export type Transcript = TranscriptMessage[];

/**
 * Cap the transcript at TRANSCRIPT_MAX entries by dropping the
 * oldest. A long autopilot run can otherwise produce thousands of
 * worker-progress messages per phase, all of which Ink re-paints on
 * every keystroke. The cut-off is silent — anyone interested in the
 * full history can rerun with --no-redact and inspect the raw worker
 * output files on disk.
 */
export function clampTranscript(transcript: Transcript): Transcript {
  if (transcript.length <= TRANSCRIPT_MAX) return transcript;
  return transcript.slice(transcript.length - TRANSCRIPT_MAX);
}

/**
 * Single unit-of-truth carried in and out of the chat controller and
 * stored in the InteractiveChat reducer. Pulling state, transcript,
 * and the detail panel into one snapshot means callers can't observe
 * a partial update — every controller round-trip swaps all three
 * atomically.
 */
export type ChatSnapshot = {
  state: ChatState;
  transcript: Transcript;
  detail: string;
};

export function createTranscript(): Transcript {
  return [];
}

function commandToText(result: Extract<ChatParseResult, { kind: "command" }>): string {
  const command = result.command;
  switch (command.type) {
    case "phase":
      return `/phase ${command.phase}${command.task ? ` ${command.task}` : ""}`;
    case "autopilot":
      return `/autopilot ${command.task}`.trimEnd();
    case "gate": {
      const phasePart = command.phase ? ` ${command.phase}` : "";
      const notePart = command.note ? ` ${command.note}` : "";
      return `/gate ${command.decision}${phasePart}${notePart}`;
    }
    case "personas":
      return `/personas ${command.personas.join(",")}`;
    case "secondary":
      return `/secondary ${command.enabled ? "on" : "off"}`;
    case "synthesize":
      return `/synthesize ${command.enabled ? "on" : "off"}`;
    case "open":
      return `/open ${command.target}`;
    case "status":
    case "help":
    case "quit":
    case "refresh":
      return `/${command.type}`;
  }
}

export function appendParsedInputToTranscript(
  transcript: Transcript,
  result: ChatParseResult,
): Transcript {
  if (result.kind === "plain") {
    return clampTranscript([...transcript, { type: "user", text: result.text }]);
  }
  if (result.kind === "error") {
    return clampTranscript([
      ...transcript,
      { type: "error", text: result.message },
    ]);
  }
  return clampTranscript([
    ...transcript,
    { type: "user", text: commandToText(result) },
  ]);
}

export function appendRuntimeMessagesToTranscript(
  transcript: Transcript,
  messages: ChatRuntimeMessage[],
): Transcript {
  return clampTranscript([
    ...transcript,
    ...messages.map((message): TranscriptMessage => {
      if (message.type === "error") return { type: "error", text: message.text };
      if (message.type === "gate-wait") return { type: "gate", text: message.text };
      return { type: "system", text: message.text };
    }),
  ]);
}

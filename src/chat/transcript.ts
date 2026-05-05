import { ChatParseResult } from "./commands.js";
import { ChatRuntimeMessage } from "./runtime.js";
import type { ChatState } from "./state.js";

export type TranscriptMessage = {
  type: "user" | "system" | "error" | "gate";
  text: string;
};

export type Transcript = TranscriptMessage[];

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
    case "gate":
      return `/gate ${command.decision}${command.note ? ` ${command.note}` : ""}`;
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
      return `/${command.type}`;
  }
}

export function appendParsedInputToTranscript(
  transcript: Transcript,
  result: ChatParseResult,
): Transcript {
  if (result.kind === "plain") {
    return [...transcript, { type: "user", text: result.text }];
  }
  if (result.kind === "error") {
    return [...transcript, { type: "error", text: result.message }];
  }
  return [...transcript, { type: "user", text: commandToText(result) }];
}

export function appendRuntimeMessagesToTranscript(
  transcript: Transcript,
  messages: ChatRuntimeMessage[],
): Transcript {
  return [
    ...transcript,
    ...messages.map((message): TranscriptMessage => {
      if (message.type === "error") return { type: "error", text: message.text };
      if (message.type === "gate-wait") return { type: "gate", text: message.text };
      return { type: "system", text: message.text };
    }),
  ];
}

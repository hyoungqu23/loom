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
    case "autopilot": {
      const flags: string[] = [];
      if (command.startPhase) flags.push(`--start ${command.startPhase}`);
      if (command.endPhase) flags.push(`--end ${command.endPhase}`);
      const flagPart = flags.length > 0 ? ` ${flags.join(" ")}` : "";
      const taskPart = command.task ? ` ${command.task}` : "";
      return `/autopilot${flagPart}${taskPart}`.trimEnd();
    }
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

/**
 * Convert a runtime message into the transcript shape. The switch is
 * exhaustive on ChatRuntimeMessage["type"]: adding a new variant to
 * that union will produce a TypeScript error here instead of silently
 * defaulting to a "system" entry. The exhaustiveness assertion at the
 * bottom enforces the same guarantee at runtime.
 */
function runtimeMessageToTranscript(
  message: ChatRuntimeMessage,
): TranscriptMessage {
  switch (message.type) {
    case "error":
      return { type: "error", text: message.text };
    case "gate-wait":
      return { type: "gate", text: message.text };
    case "run-start":
    case "run-finish":
    case "worker-start":
    case "worker-progress":
    case "worker-done":
    case "synthesis-start":
    case "gate-recorded":
    case "autopilot-start":
    case "autopilot-stop":
    case "option":
    case "status":
    case "refresh":
    case "open":
    case "help":
    case "quit":
      return { type: "system", text: message.text };
  }
  const _exhaustive: never = message;
  throw new Error(
    `unhandled chat runtime message: ${JSON.stringify(_exhaustive)}`,
  );
}

export function appendRuntimeMessagesToTranscript(
  transcript: Transcript,
  messages: ChatRuntimeMessage[],
): Transcript {
  return clampTranscript([
    ...transcript,
    ...messages.map(runtimeMessageToTranscript),
  ]);
}

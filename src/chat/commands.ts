import { GateDecision, LoomPhase, LOOM_PHASES } from "../types.js";

const PHASE_SET = new Set<string>(LOOM_PHASES);
const GATE_SET = new Set<string>(["proceed", "revise", "abort"]);
const OPEN_TARGET_SET = new Set<string>([
  "context",
  "plan",
  "workers",
  "synthesis",
]);

export type ChatCommand =
  | { type: "phase"; phase: LoomPhase; task: string }
  | { type: "autopilot"; task: string }
  | { type: "gate"; decision: GateDecision; note: string }
  | { type: "personas"; personas: string[] }
  | { type: "secondary"; enabled: boolean }
  | { type: "synthesize"; enabled: boolean }
  | { type: "status" }
  | { type: "refresh" }
  | { type: "open"; target: "context" | "plan" | "workers" | "synthesis" }
  | { type: "help" }
  | { type: "quit" };

export type ChatParseResult =
  | { kind: "plain"; text: string }
  | { kind: "command"; command: ChatCommand }
  | { kind: "error"; message: string };

function parseOnOff(raw: string, label: string): boolean | string {
  if (raw === "on") return true;
  if (raw === "off") return false;
  return `${label} must be on or off`;
}

export function parseChatInput(input: string): ChatParseResult {
  const text = input.trim();
  if (!text.startsWith("/")) return { kind: "plain", text };

  const withoutSlash = text.slice(1).trim();
  const firstSpace = withoutSlash.search(/\s/);
  const name = firstSpace === -1 ? withoutSlash : withoutSlash.slice(0, firstSpace);
  const rest = firstSpace === -1 ? "" : withoutSlash.slice(firstSpace + 1).trim();

  if (name === "phase") {
    const [phaseRaw = "", ...taskParts] = rest.split(/\s+/);
    if (!PHASE_SET.has(phaseRaw)) {
      return { kind: "error", message: `unknown phase: ${phaseRaw}` };
    }
    return {
      kind: "command",
      command: {
        type: "phase",
        phase: phaseRaw as LoomPhase,
        task: taskParts.join(" ").trim(),
      },
    };
  }

  if (name === "autopilot") {
    return { kind: "command", command: { type: "autopilot", task: rest } };
  }

  if (name === "gate") {
    const [decisionRaw = "", ...noteParts] = rest.split(/\s+/);
    if (!GATE_SET.has(decisionRaw)) {
      return { kind: "error", message: "gate must be proceed, revise, or abort" };
    }
    return {
      kind: "command",
      command: {
        type: "gate",
        decision: decisionRaw as GateDecision,
        note: noteParts.join(" ").trim(),
      },
    };
  }

  if (name === "personas") {
    return {
      kind: "command",
      command: {
        type: "personas",
        personas: rest
          .split(",")
          .map((persona) => persona.trim())
          .filter(Boolean),
      },
    };
  }

  if (name === "secondary" || name === "synthesize") {
    const parsed = parseOnOff(rest, name);
    if (typeof parsed === "string") return { kind: "error", message: parsed };
    return { kind: "command", command: { type: name, enabled: parsed } };
  }

  if (
    name === "status" ||
    name === "help" ||
    name === "quit" ||
    name === "refresh"
  ) {
    return { kind: "command", command: { type: name } };
  }

  if (name === "open") {
    if (!OPEN_TARGET_SET.has(rest)) {
      return {
        kind: "error",
        message: "open target must be context, plan, workers, or synthesis",
      };
    }
    return {
      kind: "command",
      command: {
        type: "open",
        target: rest as "context" | "plan" | "workers" | "synthesis",
      },
    };
  }

  return { kind: "error", message: `unknown command: ${name}` };
}

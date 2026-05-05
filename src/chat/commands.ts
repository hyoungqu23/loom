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
  | {
      type: "autopilot";
      task: string;
      startPhase?: LoomPhase;
      endPhase?: LoomPhase;
    }
  | {
      type: "gate";
      decision: GateDecision;
      phase?: LoomPhase;
      note: string;
    }
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
    // Optional `--start <phase>` / `--end <phase>` flags up front;
    // everything after them is the task. The flags mirror the CLI
    // `loom autopilot --start --end` shape so chat callers can scope
    // a partial run (e.g. "build only" or "stop at review").
    const tokens = rest.split(/\s+/).filter(Boolean);
    let cursor = 0;
    let startPhase: LoomPhase | undefined;
    let endPhase: LoomPhase | undefined;
    while (cursor < tokens.length) {
      const flag = tokens[cursor];
      if (flag === "--start" || flag === "--end") {
        const value = tokens[cursor + 1];
        if (!value || !PHASE_SET.has(value)) {
          return {
            kind: "error",
            message: `${flag} requires a phase (one of: ${LOOM_PHASES.join(", ")})`,
          };
        }
        if (flag === "--start") startPhase = value as LoomPhase;
        else endPhase = value as LoomPhase;
        cursor += 2;
        continue;
      }
      break;
    }
    const task = tokens.slice(cursor).join(" ");
    return {
      kind: "command",
      command: { type: "autopilot", task, startPhase, endPhase },
    };
  }

  if (name === "gate") {
    const tokens = rest.split(/\s+/).filter(Boolean);
    const decisionRaw = tokens[0] || "";
    if (!GATE_SET.has(decisionRaw)) {
      return { kind: "error", message: "gate must be proceed, revise, or abort" };
    }
    // Optional phase override: /gate <decision> [phase] [...note].
    // The second token is treated as a phase when it matches a known
    // LoomPhase; otherwise it falls through into the note.
    let phase: LoomPhase | undefined;
    let noteTokens = tokens.slice(1);
    if (noteTokens[0] && PHASE_SET.has(noteTokens[0])) {
      phase = noteTokens[0] as LoomPhase;
      noteTokens = noteTokens.slice(1);
    }
    return {
      kind: "command",
      command: {
        type: "gate",
        decision: decisionRaw as GateDecision,
        phase,
        note: noteTokens.join(" ").trim(),
      },
    };
  }

  if (name === "personas") {
    // Three call shapes:
    //   /personas a,b      → set the override list
    //   /personas reset    → clear the override list (use phase matrix)
    //   /personas          → same as /personas reset (legacy spelling)
    const trimmed = rest.trim();
    if (trimmed === "" || trimmed === "reset") {
      return {
        kind: "command",
        command: { type: "personas", personas: [] },
      };
    }
    return {
      kind: "command",
      command: {
        type: "personas",
        personas: trimmed
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

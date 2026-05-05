import {
  LoomPhase,
  LOOM_PHASES,
  PhaseGateRecord,
  PhasePlan,
  PhaseState,
  SessionContext,
} from "../types.js";

const PHASE_SET = new Set<string>(LOOM_PHASES);

function isLoomPhase(value: string): value is LoomPhase {
  return PHASE_SET.has(value);
}

/**
 * Minimal frontmatter parser. We avoid pulling in a full YAML
 * dependency: STATE.md only needs flat string fields. Anything
 * structural lives in the markdown body.
 */
function parseFrontmatter(md: string): {
  fields: { [key: string]: string };
  body: string;
} {
  if (!md.startsWith("---\n")) {
    throw new Error(
      "STATE.md frontmatter missing — expected '---' as first line",
    );
  }
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) {
    throw new Error("STATE.md frontmatter not closed with '---'");
  }
  const block = md.slice(4, end);
  const body = md.slice(end + 5);
  const fields: { [key: string]: string } = {};
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    fields[key] = value;
  }
  return { fields, body };
}

function emitFrontmatter(fields: { [key: string]: string }): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function extractSection(body: string, heading: string): string {
  const headerRegex = new RegExp(
    `^##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`,
    "m",
  );
  const match = headerRegex.exec(body);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const nextHeader = /^##\s+/m.exec(rest);
  const end = nextHeader ? nextHeader.index : rest.length;
  return rest.slice(0, end).trim();
}

function parseBulletList(section: string): string[] {
  if (!section) return [];
  const items: string[] = [];
  for (const line of section.split("\n")) {
    const m = /^\s*[-*]\s+(.+)$/.exec(line);
    if (m) items.push(m[1].trim());
  }
  return items;
}

export function serializeState(state: PhaseState): string {
  const front = emitFrontmatter({
    feature: state.feature,
    currentPhase: state.currentPhase,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  });

  const lines: string[] = [];
  lines.push(`# ${state.feature} — Loom Session State`, "");
  lines.push("## Phase History", "");
  for (const phase of state.history) lines.push(`- ${phase}`);
  lines.push("");

  lines.push("## Gate Decisions", "");
  if (state.gates.length === 0) {
    lines.push("_(no gate decisions yet)_");
  } else {
    for (const g of state.gates) {
      const note = g.note ? ` — ${g.note}` : "";
      lines.push(`- [${g.at}] ${g.phase}: ${g.decision}${note}`);
    }
  }
  lines.push("");

  lines.push("## Blockers", "");
  if (state.blockers.length === 0) {
    lines.push("_(none)_");
  } else {
    for (const b of state.blockers) lines.push(`- ${b}`);
  }
  lines.push("");

  return front + lines.join("\n");
}

const GATE_LINE = /^-\s+\[([^\]]+)\]\s+([a-z]+):\s*([a-z]+)(?:\s+—\s+(.+))?$/;

export function parseState(md: string): PhaseState {
  const { fields, body } = parseFrontmatter(md);

  for (const required of ["feature", "currentPhase", "createdAt", "updatedAt"]) {
    if (!fields[required]) {
      throw new Error(`STATE.md frontmatter missing field: ${required}`);
    }
  }

  if (!isLoomPhase(fields.currentPhase)) {
    throw new Error(`STATE.md unknown phase: ${fields.currentPhase}`);
  }

  const historyRaw = parseBulletList(extractSection(body, "Phase History"));
  for (const h of historyRaw) {
    if (!isLoomPhase(h)) {
      throw new Error(`STATE.md unknown phase in history: ${h}`);
    }
  }
  const history = historyRaw as LoomPhase[];

  const gateSection = extractSection(body, "Gate Decisions");
  const gates: PhaseGateRecord[] = [];
  if (!gateSection.includes("_(no gate decisions")) {
    for (const line of gateSection.split("\n")) {
      const m = GATE_LINE.exec(line.trim());
      if (!m) continue;
      const [, at, phase, decision, note] = m;
      if (!isLoomPhase(phase)) {
        throw new Error(`STATE.md unknown phase in gate: ${phase}`);
      }
      if (decision !== "proceed" && decision !== "revise" && decision !== "abort") {
        throw new Error(`STATE.md unknown gate decision: ${decision}`);
      }
      const record: PhaseGateRecord = { phase, decision, at };
      if (note) record.note = note;
      gates.push(record);
    }
  }

  const blockerSection = extractSection(body, "Blockers");
  const blockers = blockerSection.includes("_(none)")
    ? []
    : parseBulletList(blockerSection);

  return {
    feature: fields.feature,
    currentPhase: fields.currentPhase,
    history,
    gates,
    blockers,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  };
}

function emitParagraph(text: string): string {
  return text.trim();
}

function emitBulletList(items: string[]): string {
  if (items.length === 0) return "_(none)_";
  return items.map((item) => `- ${item}`).join("\n");
}

function emitGlossary(items: SessionContext["glossary"]): string {
  if (items.length === 0) return "_(none)_";
  return items.map(({ term, definition }) => `- **${term}**: ${definition}`).join("\n");
}

function parseGlossary(section: string): SessionContext["glossary"] {
  if (!section || section.includes("_(none)")) return [];
  const out: SessionContext["glossary"] = [];
  for (const line of section.split("\n")) {
    const m = /^\s*-\s+\*\*(.+?)\*\*:\s*(.+)$/.exec(line);
    if (m) out.push({ term: m[1].trim(), definition: m[2].trim() });
  }
  return out;
}

function paragraphFromSection(section: string): string {
  return section
    .split("\n")
    .filter((line) => !/^\s*[-*]\s+/.test(line))
    .join("\n")
    .trim();
}

export function serializeContext(ctx: SessionContext): string {
  const lines: string[] = [];
  lines.push("# Session Context", "");
  lines.push("## Problem", "", emitParagraph(ctx.problem), "");
  lines.push("## User", "", emitParagraph(ctx.user), "");
  lines.push("## Glossary", "", emitGlossary(ctx.glossary), "");
  lines.push("## Decisions", "", emitBulletList(ctx.decisions), "");
  lines.push("## Non-goals", "", emitBulletList(ctx.nonGoals), "");
  lines.push("## Open Questions", "", emitBulletList(ctx.openQuestions), "");
  return lines.join("\n");
}

export function parseContext(md: string): SessionContext {
  return {
    problem: paragraphFromSection(extractSection(md, "Problem")),
    user: paragraphFromSection(extractSection(md, "User")),
    glossary: parseGlossary(extractSection(md, "Glossary")),
    decisions: parseBulletList(extractSection(md, "Decisions")),
    nonGoals: parseBulletList(extractSection(md, "Non-goals")),
    openQuestions: parseBulletList(extractSection(md, "Open Questions")),
  };
}

function emitTestPlanTable(items: PhasePlan["testPlan"]): string {
  if (items.length === 0) return "_(none)_";
  const lines = ["| Test | Covers |", "|------|--------|"];
  for (const { name, covers } of items) {
    lines.push(`| ${name} | ${covers.join(", ")} |`);
  }
  return lines.join("\n");
}

function parseTestPlanTable(section: string): PhasePlan["testPlan"] {
  if (!section || section.includes("_(none)")) return [];
  const out: PhasePlan["testPlan"] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("|")) continue;
    if (line.includes("---")) continue;
    if (line.includes("Test") && line.includes("Covers")) continue;
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    const [name, coversCell] = cells;
    if (!name) continue;
    const covers = coversCell
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    out.push({ name, covers });
  }
  return out;
}

export function serializePlan(plan: PhasePlan): string {
  const lines: string[] = [];
  lines.push("# Phase Plan", "");
  lines.push("## Approach", "", emitParagraph(plan.approach), "");
  lines.push("## Modules", "", emitBulletList(plan.modules), "");
  lines.push(
    "## Acceptance Criteria",
    "",
    emitBulletList(plan.acceptanceCriteria),
    "",
  );
  lines.push("## Test Plan", "", emitTestPlanTable(plan.testPlan), "");
  lines.push("## Risks", "", emitBulletList(plan.risks), "");
  return lines.join("\n");
}

export function parsePlan(md: string): PhasePlan {
  return {
    approach: paragraphFromSection(extractSection(md, "Approach")),
    modules: parseBulletList(extractSection(md, "Modules")),
    acceptanceCriteria: parseBulletList(
      extractSection(md, "Acceptance Criteria"),
    ),
    testPlan: parseTestPlanTable(extractSection(md, "Test Plan")),
    risks: parseBulletList(extractSection(md, "Risks")),
  };
}

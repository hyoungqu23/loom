import * as fs from "fs";
import * as path from "path";
import { AgentConfig, LoomPhase, PhaseHandoff } from "../types";
import { getPackageRoot } from "../workspace";
import { loadDefaults } from "../config";
import { skillContext } from "./skills";
import { renderRelevantMemory } from "../memory/store";

const COMMON_PROMPT_RELATIVE = path.join("harness", "prompts", "_common.md");

export function readRelativeFile(relativePath: string): string {
  if (!relativePath) return "";
  const root = getPackageRoot();
  const filePath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, filePath);
  const escapesRoot =
    relativeToRoot === ".." ||
    relativeToRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToRoot);

  if (escapesRoot) {
    throw new Error(
      `Path escapes package root: ${relativePath} -> ${filePath}`,
    );
  }
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8").trim();
}

/**
 * Substitute `${token}` placeholders inside a system prompt template.
 * Unknown tokens are left untouched so they remain visible in logs.
 */
function renderTemplate(
  template: string,
  values: { [key: string]: string },
): string {
  return template.replace(/\$\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

export type WithRolePromptOptions = {
  /** Active phase. Falls back to `'none'` placeholder when omitted. */
  phase?: LoomPhase;
  /** Phase hand-off bundle from the session orchestrator. */
  handoff?: PhaseHandoff;
};

const MAX_PRIOR_OUTPUT_CHARS = 1500;

function clampExcerpt(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "\n…(truncated)";
}

/**
 * Walk gates backward looking for the most recent `revise` decision on
 * the active phase. A subsequent `proceed` for the same phase clears
 * the hint so a user who already moved on doesn't keep seeing stale notes.
 */
function latestReviseHint(handoff: PhaseHandoff): string | null {
  const gates = handoff.state.gates;
  for (let i = gates.length - 1; i >= 0; i -= 1) {
    const g = gates[i];
    if (g.phase !== handoff.toPhase) continue;
    if (g.decision === "revise" && g.note) return g.note;
    if (g.decision === "proceed") return null;
  }
  return null;
}

function renderPhaseContext(handoff: PhaseHandoff): string {
  const lines: string[] = ["## Phase Context", ""];
  lines.push(`- Feature: ${handoff.feature}`);
  lines.push(`- Current Phase: ${handoff.toPhase}`);
  lines.push(
    `- Previous Phase: ${handoff.fromPhase ?? "none (start of workflow)"}`,
  );
  if (handoff.state.history.length > 0) {
    lines.push(`- Phase History: ${handoff.state.history.join(" → ")}`);
  }
  const reviseHint = latestReviseHint(handoff);
  if (reviseHint) {
    lines.push("");
    lines.push("### Revision Hint (latest revise gate for this phase)");
    lines.push(
      "User asked to redo this phase with the following correction in mind.",
    );
    lines.push("Take it as authoritative input — do not contradict it.");
    lines.push("");
    lines.push(`> ${reviseHint}`);
  }
  if (handoff.state.blockers.length > 0) {
    lines.push("");
    lines.push("### Blockers");
    for (const b of handoff.state.blockers) lines.push(`- ${b}`);
  }
  if (handoff.context) {
    lines.push("");
    lines.push("### Locked Decisions (from CONTEXT.md)");
    if (handoff.context.problem) lines.push(`- Problem: ${handoff.context.problem}`);
    if (handoff.context.user) lines.push(`- User: ${handoff.context.user}`);
    for (const d of handoff.context.decisions) lines.push(`- Decision: ${d}`);
    for (const ng of handoff.context.nonGoals) lines.push(`- Non-goal: ${ng}`);
  }
  if (handoff.plan) {
    lines.push("");
    lines.push("### Plan Snapshot (from PLAN.md)");
    if (handoff.plan.approach) lines.push(`- Approach: ${handoff.plan.approach}`);
    for (const m of handoff.plan.modules) lines.push(`- Module: ${m}`);
    for (const ac of handoff.plan.acceptanceCriteria) {
      lines.push(`- AC: ${ac}`);
    }
  }
  const priorPhases = Object.keys(handoff.priorOutputs);
  if (priorPhases.length > 0) {
    lines.push("");
    lines.push("### Prior Phase Outputs (excerpts)");
    for (const phase of priorPhases) {
      const excerpt = clampExcerpt(
        handoff.priorOutputs[phase],
        MAX_PRIOR_OUTPUT_CHARS,
      );
      lines.push("", `#### ${phase}`, "", excerpt);
    }
  }
  return lines.join("\n");
}

export function withRolePrompt(
  prompt: string,
  agent: AgentConfig,
  agentName: string,
  options: WithRolePromptOptions = {},
): string {
  const defaults = loadDefaults();
  const language = defaults.language || "auto";
  const phase: string = options.phase || options.handoff?.toPhase || "none";
  const feature: string = options.handoff?.feature || "standalone";

  const commonRaw = readRelativeFile(COMMON_PROMPT_RELATIVE);
  const common = commonRaw
    ? renderTemplate(commonRaw, {
        language,
        agentName: agentName || "agent",
        runtime: agent.runtime,
        model: agent.model,
        phase,
        feature,
      })
    : "";
  const rolePrompt = readRelativeFile(agent.rolePrompt || "");
  const contractKey = agent.contract || "default";
  const contractPath =
    defaults.outputContract[contractKey] || defaults.outputContract.default || "";
  const contract = readRelativeFile(contractPath);
  const skills = skillContext(agentName || "agent", agent, prompt);
  const memory = options.handoff ? renderRelevantMemory() : "";
  const sections: string[] = [];
  if (common) sections.push(common);
  if (rolePrompt) sections.push(rolePrompt);
  if (skills) sections.push(skills);
  if (memory) sections.push(memory);
  if (options.handoff) sections.push(renderPhaseContext(options.handoff));
  if (contract) sections.push(contract);
  sections.push(`Task:\n${prompt}`);
  return sections.join("\n\n---\n\n");
}

import * as fs from "fs";
import * as path from "path";
import {
  LoomPhase,
  LOOM_PHASES,
  PhaseHandoff,
} from "../types.js";
import { getPackageRoot } from "../workspace.js";
import {
  compileRegexLiteral,
  parseMarkdownTable,
} from "../util/markdown-table.js";

export type StartPhaseRule = {
  regex: RegExp;
  phase: LoomPhase;
};

export type StartPhaseDecision = {
  phase: LoomPhase;
  confidence: "high" | "medium" | "low";
  /** Optional human-readable explanation (e.g. why we downgraded). */
  note?: string;
};

const PHASE_SET = new Set<string>(LOOM_PHASES);
const START_PHASE_RELATIVE = path.join("harness", "start-phase.md");

function isLoomPhase(value: string): value is LoomPhase {
  return PHASE_SET.has(value);
}

/**
 * Built-in start-phase rules. Order matters — the first match wins.
 *
 * Designed for the typical user prompts we see in Loom usage:
 * Korean + English mixed, short imperative phrasing, occasional
 * structured requests like "PRD" or "QA scenario".
 */
export const BUILTIN_START_PHASE_RULES: StartPhaseRule[] = [
  // discuss — PRD / requirements / new ideas
  {
    regex:
      /(\bprd\b|product requirements|requirements? doc|기획|요구사항|아이디어가|새 기능|아이디어\s|brainstorm|new idea)/i,
    phase: "discuss",
  },
  // reflect — retro / lessons learned
  {
    regex: /(retro|retrospective|회고|돌아보기|lessons learned|개선점)/i,
    phase: "reflect",
  },
  // review — code review / security audit (must come before ship so
  // "review the PR" routes here, not to PR/ship).
  {
    regex:
      /(code review|review (this|the|my|that|a |an )|보안 (검토|리뷰)|코드 리뷰|리뷰해|review the pr)/i,
    phase: "review",
  },
  // verify — QA / scenario / acceptance test
  {
    regex:
      /(\bqa\b|verify|verification|user acceptance|uat|시나리오\s*만|시나리오 검증|동작 확인)/i,
    phase: "verify",
  },
  // ship — PR / deploy / release
  {
    regex:
      /(\bpr\b|pull request|merge|deploy|release|배포|릴리스|풀리퀘|머지|ship it)/i,
    phase: "ship",
  },
  // build — implement / fix / write code
  {
    regex:
      /(implement|build (the|this|a|an)|write the (code|implementation)|fix (the )?bug|구현해|코딩해|코드 작성|코드를 작성|만들어줘)/i,
    phase: "build",
  },
  // plan — design / architecture / library choice
  {
    regex:
      /(design|architect(ure)?|tradeoff|approach|library|라이브러리|아키텍처|설계|어떻게 (하|할|만들|구현)|기술 선택)/i,
    phase: "plan",
  },
];

export function parseStartPhaseRules(markdown: string): StartPhaseRule[] {
  return parseMarkdownTable<StartPhaseRule>(
    markdown,
    (cells) => {
      const regex = compileRegexLiteral(cells[0]);
      if (!regex) return null;
      const phase = (cells[1] || "").toLowerCase();
      if (!isLoomPhase(phase)) return null;
      return { regex, phase };
    },
    { headerCellValues: ["pattern"] },
  );
}

export function loadStartPhaseRules(): StartPhaseRule[] {
  const filePath = path.join(getPackageRoot(), START_PHASE_RELATIVE);
  if (!fs.existsSync(filePath)) return BUILTIN_START_PHASE_RULES;
  const parsed = parseStartPhaseRules(fs.readFileSync(filePath, "utf8"));
  return parsed.length > 0 ? parsed : BUILTIN_START_PHASE_RULES;
}

/**
 * Apply state-based guards. A rule may match `build` but if there's
 * no PLAN.md yet, we downgrade to `plan` so the workflow doesn't
 * skip critical artefacts.
 */
function applyStateGuards(
  phase: LoomPhase,
  handoff: PhaseHandoff | null,
): StartPhaseDecision {
  if (!handoff) return { phase, confidence: "high" };

  if ((phase === "build" || phase === "review") && !handoff.plan) {
    return {
      phase: "plan",
      confidence: "medium",
      note: `requested ${phase} but no PLAN.md exists yet — starting at plan first`,
    };
  }
  if (phase === "plan" && !handoff.context) {
    return {
      phase: "discuss",
      confidence: "medium",
      note: `requested plan but no CONTEXT.md exists yet — starting at discuss first`,
    };
  }
  if (phase === "ship" && !handoff.plan) {
    return {
      phase: "discuss",
      confidence: "medium",
      note: `requested ship but session has no plan/context yet — starting at discuss`,
    };
  }
  if (phase === "verify" && !handoff.plan) {
    return {
      phase: "plan",
      confidence: "medium",
      note: `requested verify but no PLAN.md exists yet — starting at plan first`,
    };
  }
  return { phase, confidence: "high" };
}

export function inferStartPhase(
  task: string,
  handoff: PhaseHandoff | null,
): StartPhaseDecision {
  const rules = loadStartPhaseRules();
  for (const { regex, phase } of rules) {
    if (regex.test(task)) {
      return applyStateGuards(phase, handoff);
    }
  }
  return {
    phase: "discuss",
    confidence: "low",
    note: "no routing rule matched — defaulting to discuss",
  };
}

/**
 * Extract structured deltas (CONTEXT.md / PLAN.md) from raw worker
 * markdown output. Workers are prompted via the Korean planning contract
 * (`harness/contracts/planning.md`) so the section headings are mostly
 * Korean; English headings are accepted as fallbacks.
 *
 * The extractor is deliberately conservative:
 *  - returns *deltas*, not full artefacts (callers merge with what's on disk).
 *  - never throws on malformed input — missing sections just yield empty arrays.
 *  - silently ignores anything outside the recognized sections.
 *
 * Note: Some headings (e.g. `## 계획`) carry different meaning per phase —
 *   discuss → decisions, plan → acceptance criteria. We solve this by having
 *   independent alias maps per extractor.
 */

import { PhasePlan, SessionContext } from "../types.js";

export type ExtractedContext = Partial<SessionContext>;
export type ExtractedPlan = Partial<PhasePlan>;
export type ExtractedMemoryCandidate = {
  kind: "user" | "project" | "procedure";
  sourceSection: string;
  body: string;
  tags: string[];
};

const HEADING = /^#{2,3}\s+(.+?)\s*$/;

type AliasMap = { [canonical: string]: string[] };

const CONTEXT_ALIASES: AliasMap = {
  problem: ["결론 한 줄", "결론", "summary", "problem", "문제"],
  user: ["사용자", "타겟", "user", "users", "target user"],
  decisions: [
    "계획",
    "결정",
    "decisions",
    "결론들",
    "정해진 것",
    "합의 사항",
  ],
  nonGoals: ["non-goals", "out of scope", "제외", "범위 외", "비목표"],
  openQuestions: [
    "미결 질문",
    "미결 질문 (open questions)",
    "open questions",
    "미해결 질문",
    "질문",
  ],
};

const PLAN_ALIASES: AliasMap = {
  approach: [
    "접근",
    "approach",
    "기술 접근",
    "전체 접근",
    "결론 한 줄",
    "결론",
  ],
  modules: ["modules", "모듈", "변경 모듈", "파일", "변경 파일"],
  acceptanceCriteria: [
    "계획",
    "acceptance criteria",
    "ac",
    "수용 기준",
    "수락 기준",
    "ac (acceptance criteria)",
    "수용기준",
  ],
  risks: ["리스크", "risks", "위험"],
  testPlan: ["test plan", "테스트 계획", "테스트 plan"],
};

const MEMORY_ALIASES: AliasMap = {
  learning: ["배운 점", "learnings", "lessons learned", "learning"],
  procedure: ["재사용 절차", "procedures", "procedure", "reusable procedure"],
  preference: ["사용자 선호", "user preferences", "preferences", "preference"],
};

function lookupCanonical(aliases: AliasMap, heading: string): string | null {
  const norm = heading.toLowerCase().trim();
  for (const [canonical, aliasList] of Object.entries(aliases)) {
    if (aliasList.some((a) => a.toLowerCase() === norm)) return canonical;
  }
  return null;
}

type Section = { canonical: string; body: string };

function splitSections(md: string, aliases: AliasMap): Section[] {
  const out: Section[] = [];
  if (!md) return out;
  const lines = md.split("\n");
  let current: { canonical: string; bodyLines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    out.push({
      canonical: current.canonical,
      body: current.bodyLines.join("\n").trim(),
    });
    current = null;
  };

  for (const line of lines) {
    const m = HEADING.exec(line);
    if (m) {
      flush();
      const canonical = lookupCanonical(aliases, m[1]);
      if (canonical) current = { canonical, bodyLines: [] };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  flush();
  return out;
}

function bullets(body: string): string[] {
  if (!body) return [];
  const out: string[] = [];
  for (const rawLine of body.split("\n")) {
    const m = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/.exec(rawLine);
    if (!m) continue;
    const text = m[1].trim();
    if (!text) continue;
    if (/^\(none\)|_\(none\)_|없음$/i.test(text)) continue;
    out.push(text);
  }
  return out;
}

function firstParagraph(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  const para = trimmed.split(/\n\s*\n/)[0];
  // If the first paragraph is a bullet list, take the first bullet.
  const firstBullet = bullets(para)[0];
  return firstBullet || para.trim();
}

function parseTestPlanTable(body: string): PhasePlan["testPlan"] {
  if (!body) return [];
  const out: PhasePlan["testPlan"] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (/^\|[\s\-:|]+\|$/.test(line)) continue;
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    if (/^test$/i.test(cells[0]) && /^covers?$/i.test(cells[1])) continue; // header
    const [name, covers] = cells;
    if (!name || /^name$/i.test(name)) continue;
    out.push({
      name,
      covers: covers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  return out;
}

/**
 * Extract a CONTEXT delta from one persona's markdown output (typically
 * from the `discuss` phase).
 */
export function extractContextFromOutput(md: string): ExtractedContext {
  const sections = splitSections(md, CONTEXT_ALIASES);
  const out: ExtractedContext = {};
  for (const { canonical, body } of sections) {
    if (canonical === "problem" && !out.problem) {
      out.problem = firstParagraph(body);
    } else if (canonical === "user" && !out.user) {
      out.user = firstParagraph(body);
    } else if (canonical === "decisions") {
      out.decisions = (out.decisions ?? []).concat(bullets(body));
    } else if (canonical === "nonGoals") {
      out.nonGoals = (out.nonGoals ?? []).concat(bullets(body));
    } else if (canonical === "openQuestions") {
      out.openQuestions = (out.openQuestions ?? []).concat(bullets(body));
    }
  }
  return out;
}

/**
 * Extract a PLAN delta from one persona's markdown output (typically
 * from the `plan` phase).
 */
export function extractPlanFromOutput(md: string): ExtractedPlan {
  const sections = splitSections(md, PLAN_ALIASES);
  const out: ExtractedPlan = {};
  for (const { canonical, body } of sections) {
    if (canonical === "approach" && !out.approach) {
      out.approach = firstParagraph(body);
    } else if (canonical === "modules") {
      out.modules = (out.modules ?? []).concat(bullets(body));
    } else if (canonical === "acceptanceCriteria") {
      out.acceptanceCriteria = (out.acceptanceCriteria ?? []).concat(
        bullets(body),
      );
    } else if (canonical === "risks") {
      out.risks = (out.risks ?? []).concat(bullets(body));
    } else if (canonical === "testPlan") {
      out.testPlan = (out.testPlan ?? []).concat(parseTestPlanTable(body));
    }
  }
  return out;
}

function dedupe<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function emptyContext(): SessionContext {
  return {
    problem: "",
    user: "",
    glossary: [],
    decisions: [],
    nonGoals: [],
    openQuestions: [],
  };
}

export function emptyPlan(): PhasePlan {
  return {
    approach: "",
    modules: [],
    acceptanceCriteria: [],
    testPlan: [],
    risks: [],
  };
}

export function mergeContext(
  existing: SessionContext | null,
  delta: ExtractedContext,
): SessionContext {
  const base = existing ?? emptyContext();
  return {
    problem: base.problem || delta.problem || "",
    user: base.user || delta.user || "",
    glossary: base.glossary,
    decisions: dedupe(
      [...base.decisions, ...(delta.decisions ?? [])],
      norm,
    ),
    nonGoals: dedupe([...base.nonGoals, ...(delta.nonGoals ?? [])], norm),
    openQuestions: dedupe(
      [...base.openQuestions, ...(delta.openQuestions ?? [])],
      norm,
    ),
  };
}

export function mergePlan(
  existing: PhasePlan | null,
  delta: ExtractedPlan,
): PhasePlan {
  const base = existing ?? emptyPlan();
  return {
    approach: base.approach || delta.approach || "",
    modules: dedupe([...base.modules, ...(delta.modules ?? [])], norm),
    acceptanceCriteria: dedupe(
      [...base.acceptanceCriteria, ...(delta.acceptanceCriteria ?? [])],
      norm,
    ),
    testPlan: dedupe(
      [...base.testPlan, ...(delta.testPlan ?? [])],
      (t) => norm(t.name),
    ),
    risks: dedupe([...base.risks, ...(delta.risks ?? [])], norm),
  };
}

export function isContextDeltaEmpty(delta: ExtractedContext): boolean {
  return (
    !delta.problem &&
    !delta.user &&
    !(delta.decisions && delta.decisions.length) &&
    !(delta.nonGoals && delta.nonGoals.length) &&
    !(delta.openQuestions && delta.openQuestions.length)
  );
}

export function isPlanDeltaEmpty(delta: ExtractedPlan): boolean {
  return (
    !delta.approach &&
    !(delta.modules && delta.modules.length) &&
    !(delta.acceptanceCriteria && delta.acceptanceCriteria.length) &&
    !(delta.testPlan && delta.testPlan.length) &&
    !(delta.risks && delta.risks.length)
  );
}

export function extractMemoryCandidatesFromReflectOutput(
  md: string,
): ExtractedMemoryCandidate[] {
  const sections = splitSections(md, MEMORY_ALIASES);
  const out: ExtractedMemoryCandidate[] = [];
  for (const { canonical, body } of sections) {
    const items = bullets(body);
    for (const item of items) {
      if (canonical === "learning") {
        out.push({
          kind: "project",
          sourceSection: "배운 점",
          body: item,
          tags: ["reflect", "learning"],
        });
      } else if (canonical === "procedure") {
        out.push({
          kind: "procedure",
          sourceSection: "재사용 절차",
          body: item,
          tags: ["reflect", "procedure"],
        });
      } else if (canonical === "preference") {
        out.push({
          kind: "user",
          sourceSection: "사용자 선호",
          body: item,
          tags: ["reflect", "preference"],
        });
      }
    }
  }
  return out;
}

import { describe, expect, it } from "vitest";
import {
  emptyContext,
  emptyPlan,
  extractContextFromOutput,
  extractPlanFromOutput,
  isContextDeltaEmpty,
  isPlanDeltaEmpty,
  mergeContext,
  mergePlan,
} from "../../src/phases/extract";

describe("extractContextFromOutput", () => {
  it("returns an empty delta for empty input", () => {
    expect(extractContextFromOutput("")).toEqual({});
    expect(isContextDeltaEmpty(extractContextFromOutput(""))).toBe(true);
  });

  it("captures Korean planning-contract sections (계획 → decisions, 미결 질문 → openQuestions)", () => {
    const md = `
## 결론 한 줄
사용자 인증 흐름을 단순화한다.

## 계획
- magic link 로그인 추가
- OAuth 옵션 정리
- 비밀번호 정책 강화

## 미결 질문
- 세션 만료 시간을 어떻게 정할지

## 리스크
- 마이그레이션 중 다운타임
`;
    const delta = extractContextFromOutput(md);
    expect(delta.problem).toBe("사용자 인증 흐름을 단순화한다.");
    expect(delta.decisions).toEqual([
      "magic link 로그인 추가",
      "OAuth 옵션 정리",
      "비밀번호 정책 강화",
    ]);
    expect(delta.openQuestions).toEqual([
      "세션 만료 시간을 어떻게 정할지",
    ]);
  });

  it("accepts English aliases (Decisions, Open Questions)", () => {
    const md = `
## Problem
Reduce checkout abandonment.

## Decisions
- Inline error messages

## Open Questions
- Should we A/B the new layout?
`;
    const delta = extractContextFromOutput(md);
    expect(delta.problem).toBe("Reduce checkout abandonment.");
    expect(delta.decisions).toEqual(["Inline error messages"]);
    expect(delta.openQuestions).toEqual([
      "Should we A/B the new layout?",
    ]);
  });

  it("ignores unknown headings", () => {
    const md = `
## Random Heading
- ignored

## 결론 한 줄
captured.
`;
    const delta = extractContextFromOutput(md);
    expect(delta.problem).toBe("captured.");
    expect(delta.decisions).toBeUndefined();
  });
});

describe("extractPlanFromOutput", () => {
  it("captures approach/AC/risks from planning-contract output", () => {
    const md = `
## 결론 한 줄
GraphQL 게이트웨이를 도입한다.

## 계획
- 스키마 정의
- 인증 미들웨어 구현
- 캐시 정책

## 리스크
- 운영 도구 학습 비용

## Test Plan
| Test | Covers |
| login_e2e | AC1 |
| schema_validation | AC2, AC3 |
`;
    const delta = extractPlanFromOutput(md);
    expect(delta.approach).toBe("GraphQL 게이트웨이를 도입한다.");
    expect(delta.acceptanceCriteria).toEqual([
      "스키마 정의",
      "인증 미들웨어 구현",
      "캐시 정책",
    ]);
    expect(delta.risks).toEqual(["운영 도구 학습 비용"]);
    expect(delta.testPlan).toEqual([
      { name: "login_e2e", covers: ["AC1"] },
      { name: "schema_validation", covers: ["AC2", "AC3"] },
    ]);
  });

  it("isPlanDeltaEmpty returns true for empty markdown", () => {
    expect(isPlanDeltaEmpty(extractPlanFromOutput(""))).toBe(true);
  });
});

describe("mergeContext", () => {
  it("creates a fresh context when none exists", () => {
    const merged = mergeContext(null, {
      problem: "p",
      decisions: ["a"],
    });
    expect(merged.problem).toBe("p");
    expect(merged.decisions).toEqual(["a"]);
  });

  it("never overwrites existing problem/user", () => {
    const existing = emptyContext();
    existing.problem = "existing";
    existing.user = "user-existing";
    const merged = mergeContext(existing, {
      problem: "new",
      user: "user-new",
    });
    expect(merged.problem).toBe("existing");
    expect(merged.user).toBe("user-existing");
  });

  it("dedupes bullets case- and whitespace-insensitively", () => {
    const existing = emptyContext();
    existing.decisions = ["Use Postgres"];
    const merged = mergeContext(existing, {
      decisions: ["use postgres", "  Use   Postgres  ", "Add migrations"],
    });
    expect(merged.decisions).toEqual(["Use Postgres", "Add migrations"]);
  });

  it("preserves existing glossary entries even when delta is empty", () => {
    const existing = emptyContext();
    existing.glossary = [{ term: "AC", definition: "Acceptance Criteria" }];
    const merged = mergeContext(existing, { decisions: ["x"] });
    expect(merged.glossary).toEqual([
      { term: "AC", definition: "Acceptance Criteria" },
    ]);
  });
});

describe("mergePlan", () => {
  it("dedupes acceptance criteria + risks across runs", () => {
    const existing = emptyPlan();
    existing.acceptanceCriteria = ["AC1: login works"];
    existing.risks = ["session leak"];
    const merged = mergePlan(existing, {
      acceptanceCriteria: ["AC1: login works", "AC2: logout works"],
      risks: ["SESSION LEAK", "rollback complexity"],
    });
    expect(merged.acceptanceCriteria).toEqual([
      "AC1: login works",
      "AC2: logout works",
    ]);
    expect(merged.risks).toEqual(["session leak", "rollback complexity"]);
  });

  it("dedupes testPlan entries by test name", () => {
    const existing = emptyPlan();
    existing.testPlan = [{ name: "login_e2e", covers: ["AC1"] }];
    const merged = mergePlan(existing, {
      testPlan: [
        { name: "login_e2e", covers: ["AC1"] },
        { name: "logout_e2e", covers: ["AC2"] },
      ],
    });
    expect(merged.testPlan.map((t) => t.name)).toEqual([
      "login_e2e",
      "logout_e2e",
    ]);
  });

  it("retains existing approach when delta only has new bullets", () => {
    const existing = emptyPlan();
    existing.approach = "incremental migration";
    const merged = mergePlan(existing, {
      acceptanceCriteria: ["AC new"],
    });
    expect(merged.approach).toBe("incremental migration");
  });
});

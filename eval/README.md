# Loom Eval

Loom 페르소나·라우팅·계약(contract)이 의도한 구조를 유지하는지 검증하는 자동 평가 세트.

## 평가 분류

| 종류 | 위치 | 결정성 | 실행 방법 |
|---|---|---|---|
| **구조 평가** | `eval/structure/` | 결정적 (vitest) | `npm test eval/` |
| **라우팅 평가** | `eval/routing/cases.json` | 결정적 (vitest) | `npm test eval/` |
| **Start-phase 평가** | `eval/start-phase/cases.json` | 결정적 (vitest) | `npm test eval/` |
| **페르소나 변별력 평가** | `eval/personas/cases.json` | 비결정적 (LLM 호출) | `node eval/run-personas.js` (수동) |

### 구조 평가 (eval/structure)

- `personas.eval.test.ts` — 페르소나 frontmatter / contract / 본문 길이 등 페르소나 정의 자체의 회귀 방지.
- `phases-matrix.eval.test.ts` — `harness/phases.md`가 7-phase 모두 커버, primary 비어 있지 않음, 알 수 없는 페르소나 미사용 (E-3).
- `persona-phases.eval.test.ts` — 페르소나 rolePrompt frontmatter의 `phases:` 필드가 존재하고 유효 phase만 포함하며 `harness/phases.md`와 정합 (E-4).

### Start-phase 평가 (eval/start-phase)

- `cases.json` — 대표 task 문자열 → 기대 phase + state-guard 다운그레이드 골든 케이스 (E-1).
- `start-phase.eval.test.ts` — 골든 케이스 회귀 + `harness/start-phase.md` 파싱 회귀(말 mal-formed row 스킵, 룰 순서 등) (E-2).

## 실행

```bash
npm test eval/                   # 결정적 평가만
node eval/run-personas.js codex  # LLM 페르소나 평가 (비용 발생)
```

## 평가 원칙

- **구조 평가**는 모든 PR에서 자동 실행 (회귀 방지).
- **페르소나 평가**는 페르소나 파일을 수정한 PR에서 수동 실행.
- 평가 결과를 페르소나 파일에 노출하지 않는다 (과적합 방지).

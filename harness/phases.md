# Loom Phase × Persona Matrix

이 파일은 Loom 7-phase 워크플로우에서 각 phase에 어떤 페르소나가 호출되는지를 정의한다.
`src/phases/matrix.ts`의 `loadPhaseMatrix()`가 이 표를 파싱하며, 파일이 없으면
`BUILTIN_PHASE_MATRIX`로 자동 폴백한다.

## 표 형식 규약

- 표 첫 컬럼은 phase 이름 (소문자, 7개 phase 중 하나).
- `Primary` 컬럼: 해당 phase의 기본 페르소나(들). 콤마로 구분.
- `Secondary` 컬럼: 보조 페르소나(들). 비워도 됨.
- 알 수 없는 phase 또는 빈 Primary 행은 자동으로 무시된다.
- 코드 블록(```) 안의 표는 파서가 건너뛴다 (예시 작성용).

## 매트릭스

| Phase   | Primary       | Secondary           |
|---------|---------------|---------------------|
| discuss | ryze          | zilean, local-fast  |
| plan    | ornn, orianna | hwei, zilean        |
| build   | viktor        | kayle               |
| review  | kayle, shen   | hwei                |
| verify  | caitlyn       | viktor              |
| ship    | viktor, shen  |                     |
| reflect | bard          | shen                |

> `twistedfate`는 모든 phase의 라우터 + 합성자이므로 매트릭스에 별도로 등재하지 않는다.

## Phase 의도 요약

| Phase   | 목적 (한 줄)                                 | 핵심 산출물        |
|---------|---------------------------------------------|--------------------|
| discuss | 무엇을 만들지 명확히 한다 (grill-me)        | `CONTEXT.md`       |
| plan    | 어떻게 만들지 결정한다 (AC × 모듈 × 테스트) | `PLAN.md`          |
| build   | 코드를 작성한다 (TDD red-green-refactor)    | 코드 변경 + commits |
| review  | 코드와 사양의 정합성을 검증한다             | `REVIEW.md`        |
| verify  | 시나리오 기반 QA로 동작을 확인한다          | `UAT.md`           |
| ship    | PR을 만들고 문서를 갱신한다                 | PR URL + docs diff |
| reflect | 패턴을 추출하고 다음 개선 후보를 잡는다     | wrap + evolve      |

## 매트릭스 변경 가이드

1. 새로운 페르소나를 추가할 때는 자기 영역에 가장 가까운 phase의 `Primary` 또는
   `Secondary`에 등재한다. 한 페르소나가 두 phase에 중복 등재돼도 무방하다.
2. `Primary`는 phase의 산출물 책임자다 — 한 phase의 `Primary` 페르소나는 항상
   자신의 contract에 그 phase의 산출물(`CONTEXT.md` / `PLAN.md` 등) 작성 책임을
   포함해야 한다.
3. `Secondary`는 검증·보조 역할이다. Primary의 출력을 비평하거나 보강한다.
4. 변경 시 반드시 `npm test -- tests/phases/matrix.test.ts`로 회귀 검증.

## 변경 이력

- 2026-05-03: 초안 작성. 7-phase 매트릭스 정의.

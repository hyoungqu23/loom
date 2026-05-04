# Phase Plan

> 이 파일은 `plan` phase의 산출물이다. `ornn`/`orianna`가 `CONTEXT.md`의
> Decisions와 Acceptance Criteria를 받아 어떻게 구현할지 결정한다.
> `build` phase의 `viktor`는 이 PLAN.md를 보고 TDD red-green-refactor를
> 수행한다.
>
> 섹션 헤더(`## Approach`, `## Modules`, `## Acceptance Criteria`,
> `## Test Plan`, `## Risks`)는 `parsePlan()`이 의존하므로 변경하지 마라.

## Approach

(2~5문장으로 기술적 접근. 어떤 패턴/라이브러리/구조를 쓰는가, 왜 그것인가.)

## Modules

> 변경 또는 신설할 파일·모듈. 대략적인 책임 한 줄.

- `src/path/to/file.ts` — 하는 일 한 줄.
- `src/path/to/other.ts` — 하는 일 한 줄.

## Acceptance Criteria

> `CONTEXT.md`의 Decisions에서 도출. 각 항목은 검증 가능해야 한다.
> Given/When/Then 또는 체크리스트 형식.

- [AC-1] Given …, When …, Then …
- [AC-2] …

## Test Plan

> 각 테스트가 어떤 AC를 검증하는지 매핑. `build` phase의 RED는 이
> 테이블의 첫 항목들로 시작한다.

| Test | Covers |
|------|--------|
| 테스트 이름 | AC-1 |
| 테스트 이름 | AC-2 |

## Risks

> 알려진 위험·미지의 영역·롤백 시 고려사항.

- 위험 1 — 완화 방안.
- 위험 2 — 완화 방안.

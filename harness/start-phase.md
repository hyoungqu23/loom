# Loom Start-Phase Routing

`twistedfate` 오케스트레이터가 `loom autopilot`이나 단발 task에서
어느 phase부터 시작할지 결정하기 위한 휴리스틱 룰.
`src/phases/start-phase.ts`의 `loadStartPhaseRules()`가 이 표를
파싱한다. 파일이 없으면 `BUILTIN_START_PHASE_RULES`로 자동 폴백.

## 표 형식 규약

- 첫 컬럼: `/regex/flags` JS 정규식 리터럴.
- 두 번째 컬럼: 매치 시 시작할 phase 이름 (`discuss` / `plan` /
  `build` / `review` / `verify` / `ship` / `reflect`).
- **순서가 중요하다.** 첫 매치가 우선이므로 더 구체적인 룰을 위에 배치.
- 정규식 안에 `|`(alternation)를 쓰려면 markdown 표 셀 구분자와 충돌하지
  않도록 `\|`로 escape.
- 코드 블록(```) 안의 표는 파서가 건너뛴다.

## 룰

| Pattern | Phase |
|---------|-------|
| /(\bprd\b\|product requirements\|requirements? doc\|기획\|요구사항\|아이디어가\|새 기능\|아이디어\s\|brainstorm\|new idea)/i | discuss |
| /(retro\|retrospective\|회고\|돌아보기\|lessons learned\|개선점)/i | reflect |
| /(code review\|review (this\|the\|my\|that\|a \|an )\|보안 (검토\|리뷰)\|코드 리뷰\|리뷰해\|review the pr)/i | review |
| /(\bqa\b\|verify\|verification\|user acceptance\|uat\|시나리오\s*만\|시나리오 검증\|동작 확인)/i | verify |
| /(\bpr\b\|pull request\|merge\|deploy\|release\|배포\|릴리스\|풀리퀘\|머지\|ship it)/i | ship |
| /(implement\|build (the\|this\|a\|an)\|write the (code\|implementation)\|fix (the )?bug\|구현해\|코딩해\|코드 작성\|코드를 작성\|만들어줘)/i | build |
| /(design\|architect(ure)?\|tradeoff\|approach\|library\|라이브러리\|아키텍처\|설계\|어떻게 (하\|할\|만들\|구현)\|기술 선택)/i | plan |

## State Guards (코드에서 자동 적용)

휴리스틱이 한 phase로 매치돼도, 세션 상태에 필수 산출물이 없으면
TF는 자동으로 더 앞 phase로 다운그레이드한다:

| 매치된 phase | 누락 산출물 | 다운그레이드 → | 사유 |
|---|---|---|---|
| build, verify | PLAN.md 없음 | plan | 구현 전에 계약을 먼저 잡아야 함 |
| review | PLAN.md 없음 | plan | 리뷰 기준이 없음 |
| ship | PLAN.md 없음 | discuss | 세션이 비어 있어 처음부터 시작 |
| plan | CONTEXT.md 없음 | discuss | 결정 없는 설계는 사상누각 |

## 변경 가이드

1. 새 룰을 추가할 때는 **더 구체적일수록 위로**. 일반 룰이 위에 있으면
   특수 케이스가 영원히 매치되지 못한다.
2. 한국어/영어 둘 다 커버. 사용자가 어느 언어로든 쓸 수 있다고 가정.
3. 룰 변경 후 반드시 `npm test -- tests/phases/start-phase.test.ts`로
   회귀 검증.

## 변경 이력

- 2026-05-03: 초안. 7-phase 휴리스틱 + state guard 도입.

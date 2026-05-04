# Session Context

> 이 파일은 `discuss` phase의 산출물이다. `ryze`가 grill-me로 끌어낸
> 결정을 응고시킨다. 코드는 이 결정 위에서 작성되며, 모든 페르소나는
> Phase Context 블록을 통해 이 파일을 참조한다.
>
> 이 파일은 `src/phases/serialize.ts`의 `parseContext()`로 파싱되므로
> 섹션 헤더(`## Problem`, `## User`, `## Glossary`, `## Decisions`,
> `## Non-goals`, `## Open Questions`)는 변경하지 마라.

## Problem

(한 문장으로 사용자 문제를 기술. "누가, 언제, 무엇을 못 하나"가 명확해야 한다.)

## User

(주 사용자 한 명. 다중 페르소나면 우선순위로.)

## Glossary

> Matt Pocock의 domain-model 패턴 — 이 프로젝트에서 통용되는 도메인 용어를
> 한 줄 정의로 고정한다. 코드, PR, 문서에서 같은 용어가 같은 의미로 쓰이게
> 만든다. 이 사전이 풍부할수록 후속 phase의 페르소나들이 더 짧고 정확하게
> 말할 수 있다 (caveman 효과).

- **용어**: 한 줄 정의.
- **용어**: 한 줄 정의.

## Decisions

> grill-me 라운드를 통해 사용자가 OK한 결정. 후속 phase는 이 결정을
> 다시 묻지 않는다. 결정 변경이 필요하면 `discuss` phase를 revise한다.

- 결정 항목.
- 결정 항목.

## Non-goals

> 명시적으로 안 할 것. 스코프 폭주 방지. 비교: 후속 phase에서
> "이거 추가하면 어떨까요?" 제안이 들어오면, 여기 적힌 항목과 충돌하지
> 않는지 먼저 확인.

- 안 할 것 1.
- 안 할 것 2.

## Open Questions

> 아직 결정 못 한 것. 다음 `discuss` 라운드에서 해결할 후보.

- 미해결 질문 1.
- 미해결 질문 2.

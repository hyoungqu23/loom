# Loom 3.0 — 다음 개선 계획 (제안)

> 검증 결과: Loom 2.0 (7-phase / autopilot / 717 테스트 통과) 위에서 발견된
> 마찰점·구멍을 다음 라운드 작업으로 정리한다.

## 검증 요약 (먼저 끝낸 것)

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 60 파일 / **717 통과** |
| `node bin/loom.js help` | 7-phase 워크플로 + 예제 표기 OK |
| `node bin/loom.js run` / `ask` | `Unknown command` (1.x 명령 제거 확정) |
| `loom init --cwd <tmp>` → `loom phase discuss "PRD" --feature <slug> --dry-run` | `.loom/features/<slug>/STATE.md` 생성 + `currentPhase: discuss` + `history: [discuss]` 기록, dry-run 페르소나 = `ryze` (matrix.primary 일치) |
| `loom phase discuss --feature <slug> --gate proceed --note "ok"` | STATE.md `Gate Decisions`에 ISO timestamp + decision + note 기록 |
| `loom agents`, `loom sessions` | 정상 출력 |

→ Loom 2.0의 핵심 흐름(세션 생성 → phase 라우팅 → STATE 갱신 → gate 기록)은 실제로 동작한다.

## 작업 중 발견된 잔여 이슈

| ID | 관찰 | 심각도 |
|---|---|---|
| O-1 | `bin/loom.js`가 모든 에러를 `error.stack`으로 출력 — 사용자 입력 실수에도 Node 스택이 노출 | UX 마찰 |
| O-2 | `runOrchestrated` / `inferAgents`(엔진)가 남아 있고 레거시 셸의 plain-text 입력 경로가 여전히 동작 — 하지만 7-phase에서 의도한 단일 진입점은 phase/autopilot | 일관성 |
| O-3 | `loom init`이 만드는 `LOOM.md`는 한 번 생성되면 갱신되지 않음. 기존 사용자 워크스페이스의 LOOM.md는 1.x 예제를 그대로 노출 | 마이그레이션 |
| O-4 | autopilot의 게이트 프롬프트가 동기 readline — non-TTY 환경(CI, 자동화)에서는 사실상 사용 불가, 명시적 비-인터랙티브 경로 필요 | 자동화 |
| O-5 | `parsePhaseMatrix`/`parseStartPhaseRules`/`parseRoutingRules` 모두 비슷한 markdown 표 파서. 중복 + 검증 로직 차이 (e.g. 헤더 키워드 무시 처리가 일관되지 않음) | 부채 |
| O-6 | feature 세션의 `STATE.md`/`CONTEXT.md`/`PLAN.md`는 **사람이 손으로 편집**할 것을 전제하지만, `loom phase`가 워커 출력에서 자동으로 결정/AC를 발췌해 올려주지는 않음 — autopilot에서 `revise` 결정을 의미 있게 쓰려면 사용자가 직접 편집해야 함 | 핵심 워크플로 미완 |
| O-7 | `harness/phases.md` 파서가 1차 표만 신뢰하도록 강화됐지만, 그 결과 동일 phase에 대해 두 번째 행을 의도적으로 추가하는 것이 막혔다 — 향후 phase variant(예: `plan-quick` vs `plan-full`)를 도입하려면 매트릭스 스키마 확장 필요 | 확장성 |
| O-8 | `loom run`/`loom ask` 제거 후 사용자가 `--agents` 단일 호출을 더 자주 쓰게 되지만, `loom team --agents kayle "..."`은 합성 단계에서 twistedfate를 한 번 더 부른다 (`--synthesize false`로 우회 가능하나 기본 비활성이 자연스러울 수 있음) | UX |

---

## 제안: Loom 3.0 작업 스택

세 트랙으로 나눈다. 우선순위는 **A → B → C**.

### Track A — UX & 마찰 제거 (1~2 PR)

| ID | 작업 | 수용 기준 |
|----|------|-----------|
| A-1 | `bin/loom.js` 친화적 에러 출력 | 알려진 사용자 에러(`Error('Usage: ...')` 등)는 `console.error('loom: ' + msg)` + exit 1, 디버그 시에만 stack (`LOOM_DEBUG=1`) |
| A-2 | `loom team --agents <single>` 자동 `--synthesize false` | 1명짜리 team에서 합성 단계 자동 생략 (`--synthesize true` 명시 시에만 합성). 테스트 1건 추가 |
| A-3 | `loom init --force`로 LOOM.md 갱신 가이드 메시지 | `loom doctor` 또는 `loom init` 실행 시 LOOM.md가 1.x 예제를 가진 워크스페이스를 감지(grep `loom run`/`loom ask`)하면 한 줄 안내 |
| A-4 | `loom phase` 사용 흐름의 실패 메시지 정돈 | "session not found"/"task missing" 모두 같은 helpful suggestion 한 줄 첨부 (예: "tip: `loom autopilot \"<task>\" --feature <slug>` 으로 새 세션을 시작") |

### Track B — 자동화·CI 진입 (3~4 PR)

| ID | 작업 | 수용 기준 |
|----|------|-----------|
| B-1 | `loom autopilot --gate auto-proceed` (또는 `--non-interactive`) | 게이트 프롬프트 없이 모든 phase를 진행. CI 친화. 기본 `gateProvider`를 명시 결정해서 주입 |
| B-2 | `loom autopilot --gate-script <file>` | JSON 또는 텍스트로 phase별 결정을 미리 지정 (`{"discuss":"proceed","plan":"revise","build":"proceed",...}`). 회귀 시나리오 / 데모 / e2e 테스트에 활용 |
| B-3 | `loom phase`/`loom autopilot` `--json` 출력 | 호스트 자동화가 STATE/gate/synthesis 경로를 파싱할 수 있도록 stable JSON. (단, `Loom must keep printing human prose by default`) |
| B-4 | non-TTY autopilot 가드 | TTY가 아닐 때 기본 `gateProvider`가 즉시 `abort` (또는 A-1 메시지 후) |
| B-5 | e2e 시나리오 테스트 (vitest) | runtime 명령을 `true`로 stub해서 `discuss → plan → build → review` 4-step autopilot이 끝까지 도는 통합 테스트 1건 |

### Track C — Phase 워크플로 완성 (가장 무거움, 별도 PR 시리즈)

| ID | 작업 | 수용 기준 |
|----|------|-----------|
| C-1 | Phase 산출물 자동 추출 | `discuss`/`plan` 워커 출력에서 `## 결정` / `## AC` 섹션을 파싱해 `CONTEXT.md`/`PLAN.md`를 자동 갱신. 사용자는 "수정해야 하는 부분"만 손대면 되는 흐름 |
| C-2 | `loom phase --revise --hint "<note>"` | `revise` 결정에 사용자 메모를 함께 기록하고, 다음 같은 phase 호출 시 그 hint를 워커 prompt에 자동 포함 |
| C-3 | matrix variant | `phases.md`에 `Phase` 컬럼이 `plan-quick` / `plan-full`처럼 변형을 가질 수 있도록 스키마 확장. 기본값은 그대로 7-phase, 옵션으로 `--variant quick` |
| C-4 | Phase별 contract 강제 | `kayle.md`/`viktor.md` 등 페르소나 contract가 phase별 산출물 명세를 포함하도록 정렬, eval로 회귀 방지 (E-4 확장) |
| C-5 | Markdown 표 파서 통합 (O-5) | `parsePhaseMatrix` / `parseStartPhaseRules` / `parseRoutingRules`를 `parseMarkdownTable<T>(md, mapRow)` 1개로 통합 |

---

## 비포함 (의도적 보류)

- **MCP 서버 모드**: 별도 트랙. Loom 3.0에서 손대지 않음.
- **Vector memory / remote workers**: 우선순위가 더 낮은 R&D.
- **레거시 셸(`loom shell`) 제거**: 사용자 이탈 비용 미상. C-1까지 완료해 phase 워크플로가 셸을 대체할 만큼 매끄러워진 후 검토.

---

## 첫 PR 후보 (가장 작고 가치 큰 것)

세 후보 중 어떤 것부터 시작할지 사용자가 결정:

1. **A-1 + A-2 (UX 정리)** — 1 PR, 코드 ~30줄, 테스트 ~5건. 즉시 체감.
2. **B-1 + B-5 (autopilot 자동화 + e2e)** — 1 PR, 회귀 안전망 강화. CI 통합 가능.
3. **C-1 (Phase 산출물 자동 추출)** — 가장 무겁지만 7-phase의 진짜 가치를 깨움. 단독 PR.

> 권고: **A-1 + A-2** 먼저 → **B-1/B-4/B-5** → **C-1** 순. UX → 자동화 → 핵심 기능
> 순서가 사용자 신뢰를 가장 빠르게 회복시킨다.

---

## 진행 상태 (2026-05-03 갱신)

| 트랙 | 상태 |
|---|---|
| **v1 잔재 제거** | ✅ 완료. `loom run` / `loom ask` / `loom team` / `loom shell` / `loom tui` / `loom wrap` / `loom evolve` / `loom promote` / `loom sessions` / `loom show` / `loom last` / `loom logs` / `loom stderr` / `loom clean` 모두 제거. `src/{shell,tui,memory,sessions}/`, `src/engine/{orchestrator,team}.ts`, `src/commands/status.ts`, `harness/routing.md` 삭제. `.loom/{sessions,logs,memory,harness}/` 디렉터리 자동 생성도 제거. `.loom/{features,runtime-runs}/`만 남는다. |
| **C-5: 마크다운 표 파서 통합** | ✅ 완료. `src/util/markdown-table.ts`의 `parseMarkdownTable<T>` + `compileRegexLiteral`로 통합. `parsePhaseMatrix` / `parseStartPhaseRules`가 모두 이 helper 사용. |
| **C-1: phase 산출물 자동 추출** | ✅ 완료. `src/phases/extract.ts`가 워커 출력에서 `## 결론 한 줄 / 계획 / 미결 질문 / 리스크 / 테스트 계획`을 파싱하고, runner가 discuss → CONTEXT.md / plan → PLAN.md를 자동 갱신 (merge + 중복 제거). |
| **C-2: --revise --hint 재투입** | ✅ 완료. `latestReviseHint(handoff)`가 가장 최근 revise 게이트 노트를 워커 prompt의 `### Revision Hint` 섹션으로 주입. 같은 phase에 후속 proceed가 있으면 자동 클리어. |
| **C-3: phase variant 스키마** | ❌ 보류. 필요성 미확인. v3.x에서 재검토. |
| **C-4: phase × contract eval** | ✅ 완료. `eval/structure/contract-coverage.eval.test.ts`가 discuss/plan primary 페르소나 contract에 추출기 친화 헤더가 있는지 + planning 계약의 핵심 4섹션(`결론/계획/리스크/미결 질문`) 존재 회귀 검증. |

**검증**: `npx tsc --noEmit` clean. `npx vitest run` 44 파일 / **592 통과**. 라이브 smoke (init → phase discuss with stub) → CONTEXT.md 자동 생성 확인.

## 변경 이력

- 2026-05-03 — 초안. Loom 2.0 검증 후 잔여 이슈 8건 추출, 3-트랙 12-아이템으로 정리.
- 2026-05-03 — v1 전체 제거 + Track C 진행 (C-5, C-1, C-2, C-4 완료, C-3 보류).

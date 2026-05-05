# Loom 백로그 — 2026-05-05 기준

비판적 리뷰 + Codex 리뷰 + 자체 검토에서 모인 항목 중 **아직 커밋되지 않은** 작업의 단일 추적 문서.
완료된 항목은 git log(특히 카테고리 A~E + Codex 응답 + N-1/2/4 커밋)를 참조.

각 항목 형식:

- **ID** — 출처 카테고리
- **요약 / 영향 / 작업량 / 트리거** 4줄.

---

## Heavy (별 PR 트랙)

### B-10 part 2 — `proper-lockfile`로 lost update 방지

- **요약**: STATE.md / CONTEXT.md / PLAN.md / cron jobs.json의 read-modify-write race. atomic write(`f74abd4`)로 손상은 막혔으나 두 writer 동시 시 한쪽 변경이 silent하게 사라짐.
- **영향**: chat + CLI `loom phase`를 같은 feature에 동시 실행, chat 두 인스턴스, cron 동시 실행 시 gate / blockers / history 일부 누락 가능.
- **작업량**: 2~3시간. `proper-lockfile` dep 추가 + `phases/session.ts`의 writeState/writeContext/writePlan, `phases/gate.ts:recordPhaseGate`, `cron/jobs.ts:saveJobs`/`runCronJob`을 lock 블록으로 감싸기. 테스트는 setTimeout + 두 비동기 호출 race로.
- **트리거**: 사용자가 chat과 CLI를 같은 세션에 병행 사용하기 시작할 때.

### N-10 — InteractiveChat submit→controller→state 통합 테스트

- **요약**: `dispatchChatKey` 단위 테스트는 견고하지만 React 상태 시퀀스(submit/start → setState → submit/finish)의 race·closure 동작은 검증 안 됨.
- **영향**: A-2 useReducer 도입으로 race 가능성은 거의 사라졌지만, 회귀 보호가 약함.
- **작업량**: 큼. `ink-testing-library`의 raw mode 한계로 `useInput` 통합 테스트가 어려움. 대안: `InteractiveChat`을 `<Provider>`로 감싸 `dispatch`를 외부에서 호출 가능하게 만들거나, 실제 stdin TTY를 흉내 내는 fixture 추가.
- **트리거**: chat에서 race / stale closure 의심 버그가 보고될 때.

### F-true-cancellation — runner-level child process kill

- **요약**: 두 번째 Ctrl+C가 chat을 force exit 시키지만 spawn된 LLM CLI 자식 프로세스는 그대로 종료까지 진행. 진정한 cancellation 아님.
- **영향**: 큰 prompt가 도는 동안 사용자가 빠르게 빠지고 싶을 때 자식이 백그라운드에 살아 남음 (token 소모 계속).
- **작업량**: 큼. `phases/runner.ts`가 spawn된 child를 추적해 SIGTERM 전달. PhaseRunResult에 "aborted" 표기 추가. STATE.md에 부분 결과 처리 로직 필요.
- **트리거**: 사용자가 비싼 LLM 호출을 중도 취소하고 싶다고 명시할 때.

---

## Medium

### Issue 7 (이전 코드 리뷰) — `runCliCommand` 글로벌 console 패치 → sink 주입

- **요약**: `src/cli.ts:runCliCommand`가 `console.log/error`를 globally patch. `cliCommandQueue`로 직렬화는 하지만 같은 프로세스의 다른 비동기 작업이 같은 시점에 console을 쓰면 출력 섞임.
- **영향**: 일반 CLI 진입점은 `bin/loom.js`가 `main()`을 직접 호출 — runCliCommand는 테스트/임베딩 시나리오만. 실질 위험 낮음.
- **작업량**: 큼. `src/types.ts`의 `LogSink` 패턴을 모든 commands/\* 의 `console.log`에 마이그레이션.
- **트리거**: 임베딩 시나리오(loom을 라이브러리로 import)가 실제로 등장할 때.

### Issue 5-B (이전 코드 리뷰) — `loom cron add/remove/enable/disable` 서브커맨드

- **요약**: `addCronJob`이 `src/cron/jobs.ts:56`에 export돼 있지만 CLI에는 wiring 안 됨. 사용자는 `.loom/cron/jobs.json`을 직접 편집해야 함(현재 docs에 명시).
- **영향**: 일관성 — STATE.md / CONTEXT.md / PLAN.md 직접 편집 모델과 같은 line이라 의도된 디자인일 수 있음.
- **작업량**: 작음(~30분). 5-A 문서화로 우선 해소.
- **트리거**: "editor 안 쓰고 CLI로 추가하고 싶다" 요청 발생 시.

### S-1 — 단발 슬래시 (`/grill`, `/diagnose`, `/zoom-out`, `/quick`)

- **출처**: 비교 분석 3-2, 3-3 (mattpocock `/grill-me`, gstack `/investigate`).
- **요약**: phase 흐름 밖에서 단일 페르소나를 호출하는 슬래시 명령. discuss phase 전체를 띄우지 않고 grill만 단독으로 호출. `/quick <persona> <task>` 같은 일반형도 함께.
- **영향**: chat 진입 후 빠른 자문 / 단발 검토에서 phase 오버헤드 제거. 기존 phase 구조에는 영향 없음.
- **작업량**: 중간 (~반나절). `commands.ts` 파서 분기 추가, runtime에서 단일 persona phase 흐름 재사용 (gate / synthesis 생략 모드). 새 ChatRuntimeMessage variant는 불필요 — 기존 `run-start/finish`로 충분.
- **트리거**: chat 사용 빈도가 늘면서 phase 비용 없이 빠른 자문이 필요할 때.

### S-2 — `/phase <name> <persona-target>` sub-target

- **출처**: 비교 분석 3-9 (gstack `/plan-ceo-review`, `/plan-eng-review`).
- **요약**: `/phase plan ceo` 형태로 매트릭스의 일부 페르소나만 선택해 실행. 기능적으로는 `--personas` flag와 동일하지만 슬래시 안에서 직관적.
- **영향**: 사용자가 매번 `--personas` 키워드를 외우지 않아도 됨. `/phase plan` 그대로 두면 매트릭스 디폴트 유지.
- **작업량**: 작음. `commands.ts`의 `/phase` 파서가 두 번째 토큰이 phase면 그대로, 이후 토큰이 알려진 페르소나면 personas로 흡수.
- **트리거**: chat에서 "이 phase는 특정 페르소나만으로" 같은 의도가 자주 등장할 때.

### S-3 — Team mode 문서 (`.loom/config.json` git workflow)

- **출처**: 비교 분석 3-10 (gstack `--team`).
- **요약**: 팀이 같은 Loom 셋업을 공유하는 권장 워크플로를 `docs/USAGE.md`에 섹션으로 추가. `.loom/config.json`을 git에 commit하는 권장과 함께, `harness/phases.md` / `harness/contracts/*.md`를 commit해야 페르소나 매트릭스가 정합한다는 안내. 버전 호환성 체크는 `loom doctor`가 사실상 수행 — 그것을 명시.
- **영향**: 코드 변경 0. 문서만.
- **작업량**: 작음 (docs ~30분).
- **트리거**: 팀 사용 사례 발생 시 (또는 README 정리 시점에 같이).

---

## Low

### N-3 — 빈 artifact 파일도 `hasContext: true`

- `readChatArtifactFlags`가 `existsSync`만 검사. 빈 CONTEXT.md/PLAN.md도 present로 보고 → `/status`가 약간 거짓.
- 처리: 옵션 인자 `requireNonEmpty: true`로 trim 후 검사하는 길 추가.

### N-7 — `/refresh` 실패가 generic "chat error: ..."로 표시됨

- `loadState` throw → controller catch → 일반 에러 메시지. `/refresh`-specific 안내 없음.
- 처리: `/refresh` 분기 자체에 try/catch + "refresh failed: ..." 메시지.

### N-8 — markdown link의 URL이 detail 패널에 안 보임

- `[GitHub](https://example.com)` → "GitHub"만 표시, URL 잃음.
- 처리: `markdown.ts`의 link 분기에서 `link.url`을 `(${link.url})` 같은 형태로 추가.

### N-9 — `chatHelpText` 와 `printHelp`(CLI) chat 섹션 두 곳에 따로

- `runtime.ts`의 chat 슬래시 명령 목록과 `commands/help.ts`의 chat-aware usage가 별개 텍스트. drift 가능.
- 처리: `chatHelpText` 를 single source로 두고 `printHelp`이 import해 합성.

### N-11 — `/refresh` 실패 path 미검증

- `runtime.test.ts`의 refresh 테스트는 happy path만. STATE.md 손상 케이스 명시 검증 없음.
- N-7과 묶어 처리.

### N-12 — markdown 4KB 클램프 perf 미검증

- 가장 큰 detail은 `PREVIEW_BYTES=4000` 클램프. unified 처리 시간이 ms 단위라 OK이지만 단언 테스트 없음.
- 사실상 over-engineering. 사용자가 perf 이슈 보고 시에만 처리.

---

## 참고: 완료된 항목 위치

| 카테고리               | 처리 위치(commit)                                                           |
| ---------------------- | --------------------------------------------------------------------------- |
| A-1 ~ A-5 (아키텍처)   | `53d953d`, `b4472d9`, `3e257f6`, `d05c4a2`, `f88c7c8`                       |
| B-5 ~ B-12 (동작/안전) | `b15d33a`, `fa3d103`, `312b5a2`, `a43842a`, `204c002`, `ab4eb92`, `f74abd4` |
| C-13 ~ C-15 (성능)     | `427ada0`                                                                   |
| D-16 (타입)            | `ebb3f69`                                                                   |
| E-18 ~ E-22 (UX)       | `56fc958`, `696a875`, `0d0f4b1`, `f88c7c8`                                  |
| Codex 리뷰 응답        | `3a643a7`, `bbc7318`, `3a7d5f6`                                             |
| N-1 / N-2 / N-4        | `a683072`, `d6ad306`, `166f133`                                             |

---

## 추적 정책

- 백로그 항목이 처리되면 이 파일에서 제거 + git commit 해시를 위 표에 추가.
- 새 잠재 이슈가 발견되면 같은 형식으로 적절한 우선순위 섹션에 append.
- 한 달에 한 번 (또는 큰 PR 직전) "Heavy" 섹션을 다시 평가 — 트리거가 발생했는지.

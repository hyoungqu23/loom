# Loom 사용 가이드

7-phase 워크플로(`discuss → plan → build → review → verify → ship → reflect`)를
실전에서 어떻게 굴리는지 정리한 문서. 명령어 레퍼런스는 `loom help`에 있고,
이 문서는 **시나리오 위주**로 본다.

---

## 0. 시작하기

### 0.1 설치

```bash
git clone <this-repo> loom
cd loom
npm install
npm run build
npm link            # 전역 `loom` 명령으로 사용하려면
```

`npm link` 안 쓰고 직접 호출도 가능하다: `node /path/to/loom/bin/loom.js …`.

### 0.2 런타임 확인

Loom은 외부 LLM CLI를 워커로 부른다. 최소 한 개는 PATH에 있어야 한다:

```bash
loom doctor
```

```text
codex   OK   /opt/homebrew/bin/codex   codex-cli 0.128.0
claude  OK   /Users/me/.local/bin/claude   2.x
gemini  OK   /opt/homebrew/bin/gemini   0.36.0
ollama  MISS ollama not found
```

`OK`인 런타임만 사용된다. 페르소나 ↔ 런타임 매핑은 `loom agents`로 확인.

### 0.3 프로젝트에서 초기화

```bash
cd /path/to/your/project
loom init
```

생성되는 것:

```text
.loom/
├── config.json         # 이 프로젝트 전용 runtime/agent 오버라이드
├── features/           # phase 세션 (현재 비어 있음)
└── runtime-runs/       # `loom doctor --smoke` 트랜스크립트
LOOM.md                 # 이 프로젝트의 onboarding 가이드
```

---

## 0.5 Chat TUI: 인터랙티브 모드

CLI 명령을 다 외우는 대신 채팅 인터페이스로 작업하고 싶다면 `loom chat`을 쓴다.
인터랙티브 터미널에서 `loom`을 인자 없이 실행해도 같은 화면이 뜬다 — 비-TTY 환경
(파이프, CI)에서는 기존 help가 나오므로 스크립트 호환성은 유지된다.

```bash
loom                          # 인터랙티브 TTY → Chat TUI 진입
loom chat                     # 가장 최근 업데이트된 세션을 자동으로 연다
loom chat --feature billing-v2  # 명시적으로 특정 feature 세션 열기 (없으면 생성)
```

### 0.5.1 슬래시 명령

채팅창에서 `/`로 시작하면 명령, 아니면 평문 메모.

| 명령 | 동작 |
|---|---|
| `/phase <name> [task]` | 단일 phase 실행. 종료 후 자동 게이트는 묻지 않는다. |
| `/autopilot <task>` | 현재 phase부터 시작해 phase마다 게이트 입력을 대기하는 루프. |
| `/gate proceed\|revise\|abort [note]` | 게이트 결정 기록. autopilot 루프도 이걸로 진행/재실행/중단. |
| `/personas a,b` | 다음 실행부터 페르소나 오버라이드. `/secondary`보다 우선. |
| `/secondary on\|off` | 매트릭스 secondary 페르소나까지 실행할지. |
| `/synthesize on\|off` | twistedfate 합성 단계 활성/비활성. |
| `/open context\|plan\|workers\|synthesis` | detail 패널에 해당 산출물 미리보기. `/open workers`는 파일 목록만 — 콘텐츠는 로드하지 않음. |
| `/status` | 현재 chat / 세션 상태 한 줄 요약. |
| `/refresh` | 외부 에디터로 STATE.md / CONTEXT.md / PLAN.md를 수정한 뒤 chat이 그 변경을 다시 읽어들이게 한다. |
| `/help` | 슬래시 명령 목록. |
| `/quit` | 종료. Ctrl+C로도 idle일 때 깔끔하게 빠져나간다. |

### 0.5.2 게이트 동작 차이

- `/phase` — 한 phase만 돌리고 입력 라인으로 즉시 복귀. 사용자가 `/gate`를 명시적으로 입력하기 전까지 STATE.md gates는 갱신되지 않는다.
- `/autopilot` — 매 phase가 끝나면 `waiting-for-gate` 상태로 멈춰서 `/gate proceed|revise|abort` 입력을 기다린다. `proceed`는 다음 phase, `revise`는 같은 phase 재실행(노트는 다음 워커 프롬프트에 revision hint로 자동 주입), `abort`는 루프 종료.

### 0.5.3 Detail 패널

phase 실행 직후 detail 패널이 자동 갱신된다.

- `workers/<phase>/synthesis.md`가 있으면 그 콘텐츠 우선(최대 4KB).
- 합성이 비어 있거나 `/synthesize off`라면 워커 stdout 헤드(페르소나당 200B) 요약.
- `/open <target>`으로 임의의 시점에 다른 산출물을 패널에 띄울 수 있다.

### 0.5.4 취소 / 에러 UX

- Ctrl+C — idle일 때 깔끔히 종료. 실행 중일 때는 "cancel requested" 알림만 transcript에 남기고 현재 워커는 끝까지 돌린다.
- 런타임 오류(spawn 실패, STATE.md 누락, ollama 프롬프트 한계 초과 등)는 `chat error: <message>` 형태로 transcript에 기록되고 채팅 자체는 살아 있다.

---

## 1. 첫 feature: 30초 만에 끝내보기

처음이라면 가장 짧은 코스부터:

```bash
loom autopilot "사용자 검색 자동완성을 추가한다" --feature autocomplete
```

일어나는 일:

1. Loom이 task에서 시작 phase를 추론한다 (대개 `discuss`).
2. `.loom/features/autocomplete/` 디렉터리 생성, `STATE.md` 작성.
3. `discuss` phase의 페르소나(기본 `ryze`)를 호출.
4. 워커 출력에서 `## 결론 한 줄 / 계획 / 미결 질문`을 자동 추출 → `CONTEXT.md` 작성.
5. **게이트 프롬프트:** `proceed / revise / abort` 중 하나.
6. `proceed` → 다음 phase(`plan`)로. `plan` 끝나면 `PLAN.md`도 자동 작성.
7. 7-phase 끝나거나 `abort`까지 반복.

게이트마다 `CONTEXT.md` / `PLAN.md`를 직접 보고 결정하면 된다.

---

## 2. 자주 쓰는 시나리오

### 2.1 진행 중 feature의 다음 phase만 돌리기

```bash
loom phase plan "API 설계 상세화" --feature autocomplete
```

`--feature autocomplete`는 기존 세션을 이어 쓴다. `STATE.md`는 그대로, `PLAN.md`는 머지된다.

### 2.2 가장 최근 세션 이어가기 (이름 기억 안 날 때)

```bash
loom phase build "1차 구현" --feature latest
```

### 2.3 같은 phase를 다시 돌리되 LLM에게 수정 사항 알려주기

```bash
# 1) 마지막 결과가 마음에 안 들면 revise 게이트로 노트 남기기
loom phase plan --feature autocomplete --gate revise --note "p99 latency 200ms 미만이어야 함. 캐시 레이어 재검토."

# 2) 다음 plan 호출 시 노트가 워커 prompt에 자동 주입됨
loom phase plan "재설계" --feature autocomplete
```

워커는 prompt 안에서 다음과 같은 섹션을 받는다:

```text
### Revision Hint (latest revise gate for this phase)
User asked to redo this phase with the following correction in mind.
Take it as authoritative input — do not contradict it.

> p99 latency 200ms 미만이어야 함. 캐시 레이어 재검토.
```

같은 phase에 후속 `proceed` 게이트가 들어오면 hint는 자동으로 사라진다.

### 2.4 spawn 없이 결정만 기록하기 (외부 회의·코드리뷰 등)

```bash
loom phase review --feature autocomplete --gate proceed --note "외부 보안 리뷰 통과 — TLS 1.3 강제 확정"
```

워커 호출 없이 `STATE.md`의 Gate Decisions에 한 줄 추가.

### 2.5 일부 phase만 자동 진행

```bash
loom autopilot "작은 hotfix" --feature autocomplete --start build --end review
```

build → review만 돌리고 끝. `STATE.md`에 phase가 없다고 거부되지 않는다 (state-guard가 있으면 더 앞 phase로 자동 다운그레이드한다).

### 2.6 특정 페르소나만 돌리기

```bash
loom phase review "이 PR 리뷰" --feature autocomplete --personas kayle
```

매트릭스의 primary 페르소나 대신 명시한 페르소나만 호출. 단일 페르소나 호출도 이 경로.

### 2.7 Secondary 페르소나까지 함께 돌리기

```bash
loom phase discuss "요구사항 정리" --feature autocomplete --include-secondary
loom autopilot "사용자 검색 자동완성을 추가한다" --feature autocomplete --include-secondary
```

기본은 매트릭스의 primary 페르소나만 호출한다. `--include-secondary`를 주면 같은 phase에서 primary 다음 secondary를 함께 병렬 실행한다. `--personas a,b`를 명시하면 `--include-secondary`보다 우선한다.

### 2.8 합성 단계 끄기

```bash
loom phase plan "..." --feature autocomplete --synthesize false
```

기본은 `twistedfate`가 워커 출력을 합성한다. 단일 페르소나거나 합성이 군더더기일 때 끈다.

### 2.9 dry-run으로 어떤 페르소나가 어떻게 호출되는지만 보기

```bash
loom phase plan "API 설계" --feature autocomplete --dry-run
```

```text
ornn: claude -p --permission-mode plan --model opusplan --effort high - <prompt via stdin>
orianna: claude -p --permission-mode plan --model opus --effort xhigh - <prompt via stdin>
[loom] phase plan complete (workers=0, session=...)
```

`STATE.md`도 갱신되지 않는다 — pure dry run.

---

## 3. 게이트 결정 (가장 중요한 의사결정 지점)

각 phase 끝에서 사용자가 내리는 결정:

| Decision | 효과 | 언제 쓰나 |
|---|---|---|
| `proceed` (기본) | 게이트 기록 + 다음 phase | 워커 출력이 만족스러우면 |
| `revise` | 같은 phase 재실행 | 출력이 부족하거나 방향 수정 필요 |
| `abort` | 게이트 기록 + autopilot 종료 | 더 큰 결정이 필요해 일시 중단 |

`autopilot`은 phase마다 readline 프롬프트를 띄운다. CLI로 직접 결정 기록만 남기려면:

```bash
loom phase <name> --feature <slug> --gate <decision> --note "<text>"
```

---

## 4. CONTEXT.md / PLAN.md 다루기

이 두 파일이 phase 사이의 **계약(contract)**이다. 다음 phase의 워커는 항상 이걸 읽는다.

### 4.1 자동 작성 동작

| Phase | 자동 갱신 | 추출 헤더 (계약 기준) |
|---|---|---|
| `discuss` | `CONTEXT.md` | `## 결론 한 줄` → problem, `## 계획` → decisions, `## 미결 질문` → openQuestions |
| `plan` | `PLAN.md` | `## 결론 한 줄`/`## 접근` → approach, `## 계획` → acceptanceCriteria, `## 리스크` → risks, `## Test Plan` 표 → testPlan |
| 그 외 | (자동 갱신 없음) | 워커 출력은 `workers/<phase>/<persona>.md`에 누적만 |

영문 헤더(`## Problem`, `## Decisions`, `## Acceptance Criteria` 등)도 인식한다.

### 4.2 머지 정책

- **bullet 항목**: 기존 + 신규 합집합, 대소문자/공백 무시 dedupe.
- **`problem` / `approach` 같은 단일 텍스트 필드**: 기존 값이 비어 있을 때만 채움 (덮어쓰지 않음).
- **`glossary` 같은 사용자 편집 필드**: 자동 갱신 대상 아님 — 직접 편집한 내용은 안전하다.

### 4.3 직접 편집해야 할 때

자동 추출이 맞는 답을 못 잡거나 사람이 손봐야 할 때:

1. `vim .loom/features/<slug>/CONTEXT.md` 또는 `PLAN.md` 직접 편집.
2. `loom phase <next-phase> ... --feature <slug>`로 다음 phase 진행.
3. 다음 phase 워커는 편집된 내용을 그대로 받는다.

`revise` 흐름도 같은 패턴 — 게이트 노트 + 직접 편집을 섞어 쓴다.

---

## 5. Phase별 페르소나 (기본값)

```bash
loom agents     # 전체 등록 페르소나
```

`harness/phases.md`의 매트릭스가 phase → 페르소나 매핑을 결정한다:

| Phase | Primary | Secondary | 산출물 |
|---|---|---|---|
| discuss | `ryze` | `zilean`, `local-fast` | `CONTEXT.md` |
| plan | `ornn`, `orianna` | `hwei`, `zilean` | `PLAN.md` |
| build | `viktor` | `kayle` | 코드 변경 |
| review | `kayle`, `shen` | `hwei` | review/synthesis.md |
| verify | `caitlyn` | `viktor` | verify/synthesis.md |
| ship | `viktor`, `shen` | — | PR + docs diff |
| reflect | `bard` | `shen` | reflect/synthesis.md |

`twistedfate`은 모든 phase의 합성자(synthesizer) — 매트릭스에 없어도 phase 끝에 자동 호출된다 (`--synthesize false`로 끔).

`--include-secondary`로 primary와 secondary를 함께 실행할 수 있다. `--personas a,b,c`로 매트릭스를 일회성으로 무시할 수 있으며, 이 경우 `--include-secondary`는 적용되지 않는다.

---

## 6. 설정

### 6.1 런타임 / 에이전트 오버라이드

```bash
loom config show                          # 전체
loom config show agents.kayle             # 한 페르소나
loom config set agent.kayle.model opus    # 모델 변경
loom config set runtime.gemini.model gemini-2.5-flash
loom config path                          # 설정 파일 경로
```

`agent.*` / `runtime.*` 단수형도 alias로 받는다.

### 6.2 페르소나 매트릭스 / 시작 phase 룰 커스터마이징

매트릭스와 룰은 모두 markdown 표로 외부화돼 있다. 코드 수정 없이 바꿀 수 있다.

| 파일 | 역할 |
|---|---|
| `harness/phases.md` | phase × 페르소나 매트릭스 |
| `harness/start-phase.md` | autopilot 시작 phase 휴리스틱 |
| `harness/contracts/*.md` | 페르소나 출력 계약 |
| `harness/prompts/*.md` | 페르소나 role prompt |

표 형식만 지키면 자동 적용된다. 변경 후 회귀 검증:

```bash
npx vitest run eval/                      # 구조·휴리스틱 eval만 (결정적)
```

---

## 7. 디렉터리 레이아웃 한눈에

```text
.loom/
├── config.json
├── features/
│   └── <slug>/
│       ├── STATE.md                # phase 진행 상태, 게이트 이력
│       ├── CONTEXT.md              # discuss 산출물 (자동)
│       ├── PLAN.md                 # plan 산출물 (자동)
│       └── workers/
│           ├── discuss/
│           │   ├── ryze.md         # 누적 워커 출력
│           │   ├── ryze.run/       # raw stdout/stderr/result.json
│           │   └── synthesis.md    # twistedfate 합성
│           ├── plan/
│           ├── build/
│           └── ...
├── runtime-runs/                   # `loom doctor --smoke` 결과
├── cron/
│   ├── jobs.json                   # cron 작업 정의 (직접 편집)
│   └── runs/                       # 실행마다 stdout/stderr/result.json
│       └── <timestamp>-<id>/
└── metrics/
    └── events.jsonl                # phase / cron 메트릭
```

`STATE.md`만 봐도 진행 상황 다 알 수 있게 설계됨. 직접 보고 싶으면:

```bash
cat .loom/features/<slug>/STATE.md
```

---

## 7.5 Cron 작업

Loom은 `.loom/cron/jobs.json`을 직접 편집해서 정의하는 단순 cron 모델을 쓴다.
`loom cron list`로 현재 등록된 작업을 보고, `loom cron run <id>`로 즉시 실행한다.
스케줄러 자체는 외부 cron/launchd/Task Scheduler에 위임하고, Loom은 정의·실행·기록만 담당한다.

### 7.5.1 jobs.json 스키마

```json
{
  "jobs": [
    {
      "id": "nightly-qa",
      "command": "npm",
      "args": ["test"],
      "schedule": "0 2 * * *",
      "cwd": "/abs/path/inside/workspace",
      "feature": "nightly-qa",
      "enabled": true,
      "approvalMode": "allow-risky"
    }
  ]
}
```

| 필드 | 의미 |
|---|---|
| `id` | 식별자. `loom cron run <id>`에서 사용. |
| `command` / `args` | 실제로 spawn할 외부 명령. |
| `schedule` | 외부 cron 표기. Loom 내부에선 메타데이터로만 다룸. |
| `cwd` | 워크스페이스 내부 경로여야 함. 밖이면 `escapes workspace` 에러. |
| `feature` | 어떤 feature 세션과 연관되는지. 표시·필터링용. |
| `enabled` | `false`면 `loom cron run`이 거부. |
| `approvalMode` | `"allow-risky"`로 명시해야 `safe`가 아닌 명령(예: `curl`, `cat .env`)이 통과. |

### 7.5.2 실행 결과는 어디에 남나

`loom cron run <id>` 한 번마다 다음이 생긴다.

```text
.loom/cron/runs/<timestamp>-<id>/
├── stdout.log     # redact 적용된 표준 출력
├── stderr.log     # redact 적용된 표준 에러
└── result.json    # status, signal, command, args, durationMs, startedAt, finishedAt
```

`stdout.log` / `stderr.log`는 `redactText`로 시크릿 패턴(API 키, GitHub PAT, AWS access key, Bearer 헤더 등)을 자동으로 마스킹한다.

30일 이상 묵은 디렉토리는 다음 cron run 시점에 자동 정리된다.

또한 `.loom/metrics/events.jsonl`에 `{ "type": "cron", "id": "...", "status": ..., "durationMs": ... }` 한 줄이 추가된다.

### 7.5.3 위험 차단 정책

`src/engine/risk.ts`가 `command`를 분류한 결과가 `safe`가 아니면 (`true`, `ls`, `cat` 같은 알려진 안전 명령 외 모든 것) `loom cron run`은 즉시 throw 한다. 이를 통과시키려면 jobs.json 항목에 `"approvalMode": "allow-risky"`를 명시해야 한다 — 의도적인 한 단계의 게이트.

### 7.5.4 자주 묻는 운영 질문

- **새 작업을 어떻게 추가하나** — `.loom/cron/jobs.json`을 직접 편집한다. CLI에 add 서브커맨드는 두지 않는다 (STATE.md / CONTEXT.md / PLAN.md를 사람이 직접 편집하는 모델과 동일).
- **`loom cron list`가 비어 있다** — `.loom/cron/jobs.json`이 아직 없다. 위 스키마대로 생성하면 된다.
- **`approvalMode: "allow-risky"`를 매번 쓰기 번거롭다** — 그게 의도다. cron은 무인 실행 경로이므로 한 번의 명시적 승인이 사고 방지의 핵심이다.

---

## 8. 트러블슈팅

### "Unknown command: run / ask / team / shell / tui …"

v1 명령은 모두 제거됐다. 매핑은 [`MIGRATION_LOOM_2.md`](MIGRATION_LOOM_2.md). 요약:

- `loom run "<task>"` → `loom autopilot "<task>" --feature <slug>`
- `loom ask --agent X "<task>"` → `loom phase <phase> "<task>" --feature <slug> --personas X`
- `loom team --agents a,b "<task>"` → `loom phase <phase> "<task>" --feature <slug> --personas a,b`

### "feature title is required"

`--feature <slug>`을 넣지 않았거나 `--feature` 다음에 빈 문자열이 들어갔다. 슬러그는 임의의 한 단어 (예: `dark-mode`).

### `--feature latest`인데 "no sessions exist yet"

아직 만들어진 feature 세션이 없다. 첫 feature는 명시적 슬러그로 시작:

```bash
loom autopilot "<task>" --feature my-first-feature
```

### CONTEXT.md / PLAN.md가 안 만들어졌다

자동 추출은 워커 출력에 `## 결론 한 줄` / `## 계획` / `## 리스크` 같은 인식 가능한 헤더가 있을 때만 동작한다. 없으면 silent skip — 워커 raw 출력은 항상 `workers/<phase>/<persona>.md`에 남는다.

확인:

```bash
cat .loom/features/<slug>/workers/discuss/ryze.md
```

헤더가 빠졌으면 페르소나 contract(`harness/contracts/planning.md`)를 점검하거나, CONTEXT.md를 직접 편집한다.

### 게이트 프롬프트가 자동화에서 멈춘다

`loom autopilot`의 기본 게이트는 readline 인터랙티브다. 비-TTY 환경(CI 등)에서는 별도 `gateProvider`를 코드에서 주입해야 한다. CLI 전용 비-인터랙티브 플래그는 v3 로드맵 대상 (`docs/LOOM_3_PROPOSAL.md` Track B).

### 빌드 후에도 옛날 동작이 남아 있다

`tsc`는 삭제된 모듈의 dist 산출물을 정리하지 않는다. `npm run build`가 `rm -rf dist && tsc`로 셋업돼 있어 이 케이스는 막혀 있지만, 직접 `npx tsc`만 돌렸다면 `npm run clean && npm run build`를 사용한다.

### 런타임이 OK인데 task가 즉시 실패

```bash
loom doctor --smoke --runtimes codex,claude
```

`--smoke`는 각 런타임에 minimal prompt를 실제로 보내본다. 결과는 `.loom/runtime-runs/`에 저장.

---

## 9. 빠른 레퍼런스 (한 페이지)

```bash
# 시작
loom init
loom doctor

# 새 feature 처음부터 끝까지
loom autopilot "<task>" --feature <slug>

# 한 phase만
loom phase <discuss|plan|build|review|verify|ship|reflect> "<task>" --feature <slug>

# 게이트만 기록
loom phase <name> --feature <slug> --gate <proceed|revise|abort> --note "<text>"

# 일부 phase만 자동 진행
loom autopilot "<task>" --feature <slug> --start build --end review

# 이어가기
loom phase build "..." --feature latest

# 매트릭스 무시하고 특정 페르소나만
loom phase review "..." --feature <slug> --personas kayle

# primary + secondary 함께 실행
loom phase discuss "..." --feature <slug> --include-secondary
loom autopilot "<task>" --feature <slug> --include-secondary

# dry-run
loom phase plan "..." --feature <slug> --dry-run

# 설정
loom config show
loom config set agent.kayle.model opus

# 진행 확인
cat .loom/features/<slug>/STATE.md
```

---

## 참고 문서

- [`README.md`](../README.md) — 아키텍처 / 설계 원칙
- [`MIGRATION_LOOM_2.md`](MIGRATION_LOOM_2.md) — v1 → v2 마이그레이션
- [`EXAMPLE_FEATURE_FLOW.md`](EXAMPLE_FEATURE_FLOW.md) — 디렉터리 트리 + STATE.md 갱신 타이밍 한 페이지
- [`MODELS.md`](MODELS.md) — 모델 선택 가이드
- [`LOOM_3_PROPOSAL.md`](LOOM_3_PROPOSAL.md) — 다음 개선 트랙
- `harness/phases.md` — 페르소나 매트릭스 (편집 가능)
- `harness/start-phase.md` — autopilot 시작 phase 룰 (편집 가능)

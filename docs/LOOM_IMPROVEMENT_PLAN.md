# Loom Improvement Plan

> Goal: Hermes Agent의 장점(닫힌 학습 루프, 지속 기억, skill 자기개선, 예약 실행, 안전한 실행 환경)을 Loom의 7-phase harness에 맞게 흡수한다.

## Overview

Loom은 이미 `discuss -> plan -> build -> review -> verify -> ship -> reflect` workflow, per-feature markdown state, multi-runtime workers, skill-aware prompts를 갖고 있다. 다음 개선은 새 orchestration을 만드는 것이 아니라, 현재 구조 위에 **장기 기억, 절차 학습, 자동화, 안전성, 평가 루프**를 붙이는 방향이 가장 효율적이다.

## Architecture Decisions

- Plain markdown state는 유지한다. `.loom/features/<slug>/` 구조는 사람이 읽고 수정할 수 있어 Loom의 핵심 장점이다.
- 장기 기억은 feature session과 분리한다. feature state는 작업 기록이고, memory는 재사용 지식이다.
- Skill은 prompt text가 아니라 실행 가능한 절차 단위로 관리한다. trigger, inputs, verification, failure recovery를 포함해야 한다.
- Self-improvement는 자동 수정 전에 evidence를 요구한다. 실패 로그, 반복 작업, 사용자 승인, 테스트 결과 중 하나 이상이 있어야 memory/skill promotion이 가능하다.
- Gateway와 cron은 core phase runner 위에 얇게 얹는다. CLI 동작과 state format을 먼저 안정화한다.

## Task List

### Phase 1: Memory Foundation

## Task 1: Memory Store Layout

**Description:** `.loom/memory/` 아래에 user, project, procedure memory를 분리하는 파일 구조와 타입을 정의한다.

**Implemented layout:**

```text
.loom/memory/
├── user.md          # 사용자 선호, 커뮤니케이션 규칙, 반복 결정
├── project.md       # 저장소 구조, 명령, 아키텍처, 운영 규칙
├── procedures/      # 재사용 가능한 절차형 기억
├── candidates/      # reflect 이후 승격 대기 후보
└── archive/         # reject 또는 폐기된 후보
```

Memory entry metadata:

```markdown
<!-- loom-memory
source: reflect:<feature>
confidence: low|medium|high
updatedAt: 2026-05-04T00:00:00.000Z
tags: comma, separated, tags
-->
```

**Acceptance criteria:**
- [ ] `.loom/memory/user.md`, `.loom/memory/project.md`, `.loom/memory/procedures/` 구조가 문서화된다.
- [ ] memory entry의 최소 필드(source, confidence, updatedAt, tags)가 정해진다.
- [ ] feature session state와 memory의 책임 차이가 README 또는 docs에 설명된다.

**Verification:**
- [ ] `npm run check`
- [ ] memory fixture를 읽는 단위 테스트 추가

**Dependencies:** None

**Files likely touched:**
- `src/types.ts`
- `src/phases/session.ts`
- `docs/`
- `tests/`

**Estimated scope:** Medium

## Task 2: Memory Loader For Worker Prompts

**Description:** phase worker prompt를 만들 때 관련 memory를 읽어 `### Relevant Memory` 섹션으로 주입한다.

**Acceptance criteria:**
- [ ] user/project memory가 모든 phase prompt에 제한된 크기로 주입된다.
- [ ] procedure memory는 phase와 tag가 맞을 때만 주입된다.
- [ ] memory가 없어도 기존 phase 실행은 동일하게 동작한다.

**Verification:**
- [ ] `npm run test -- tests/agents/prompt-phase.test.ts`
- [ ] prompt snapshot 또는 문자열 테스트로 memory 섹션 검증

**Dependencies:** Task 1

**Files likely touched:**
- `src/agents/prompt.ts`
- `src/agents/skills.ts`
- `tests/agents/`

**Estimated scope:** Medium

## Task 3: Session Search Index

**Description:** 과거 `.loom/features/*` 산출물을 검색해서 현재 feature handoff에 관련 context를 제공한다.

**Acceptance criteria:**
- [ ] feature title, phase outputs, PLAN/CONTEXT를 대상으로 keyword search가 가능하다.
- [ ] `loom memory search "<query>"` 또는 내부 helper가 top N 결과를 반환한다.
- [ ] 검색 결과는 file path와 짧은 summary를 포함한다.

**Verification:**
- [ ] `npm run test -- tests/`
- [ ] fixture feature 2개 이상으로 ranking 테스트

**Dependencies:** Task 1

**Files likely touched:**
- `src/commands/`
- `src/util/`
- `tests/`

**Estimated scope:** Medium

### Checkpoint: Memory Foundation

- [ ] 기존 `loom phase --dry-run` 출력이 깨지지 않는다.
- [ ] memory가 없는 저장소에서도 모든 테스트가 통과한다.
- [ ] prompt에 들어가는 memory 크기 제한이 있다.

### Phase 2: Closed Learning Loop

## Task 4: Reflect-to-Memory Extractor

**Description:** `reflect` phase 결과에서 반복 가능한 지식과 사용자 선호를 추출해 memory 후보로 저장한다.

**Acceptance criteria:**
- [ ] reflect output의 `## 배운 점`, `## 재사용 절차`, `## 사용자 선호` 섹션을 파싱한다.
- [ ] 후보는 바로 확정하지 않고 `.loom/memory/candidates/`에 저장된다.
- [ ] 중복 후보는 source를 추가하고 body는 중복 저장하지 않는다.

**Verification:**
- [ ] `npm run test -- tests/phases/extract.test.ts`
- [ ] reflect fixture에서 후보 파일 생성 검증

**Dependencies:** Task 1

**Files likely touched:**
- `src/phases/extract.ts`
- `src/phases/runner.ts`
- `tests/phases/`

**Estimated scope:** Medium

## Task 5: Memory Promotion Command

**Description:** memory candidate를 사용자가 검토하고 user/project/procedure memory로 승격하는 명령을 추가한다.

**Acceptance criteria:**
- [ ] `loom memory list`가 pending candidates를 보여준다.
- [ ] `loom memory promote <id> --type user|project|procedure`가 후보를 승격한다.
- [ ] `loom memory reject <id>`가 후보를 archive한다.

**Verification:**
- [ ] `npm run test -- tests/commands/`
- [ ] promote/reject 후 파일 이동과 내용 보존 검증

**Dependencies:** Task 4

**Files likely touched:**
- `src/commands/`
- `src/cli.ts`
- `tests/commands/`

**Estimated scope:** Medium

## Task 6: Skill Creation Candidate

**Description:** 반복 작업에서 skill 후보를 생성하되, 자동 설치는 하지 않는다.

**Acceptance criteria:**
- [ ] reflect 결과가 절차형이면 `skills/candidates/<slug>/SKILL.md` 초안을 만든다.
- [ ] skill 초안은 trigger, steps, verification, failure recovery를 포함한다.
- [ ] 후보 생성은 동일 feature에서 최대 1회로 제한된다.

**Verification:**
- [ ] `npm run test -- tests/phases/`
- [ ] 생성된 `SKILL.md`가 필수 섹션을 포함하는지 검증

**Dependencies:** Task 4

**Files likely touched:**
- `src/phases/runner.ts`
- `src/agents/skills.ts`
- `tests/`

**Estimated scope:** Medium

### Checkpoint: Learning Loop

- [ ] `reflect` phase 이후 memory/skill 후보가 생성된다.
- [ ] 후보 승격은 명시적 명령 없이는 발생하지 않는다.
- [ ] 잘못된 후보를 reject/archive할 수 있다.

### Phase 3: Automation And Gateway

## Task 7: Non-Interactive Autopilot Policy

**Description:** CI와 cron에서 쓸 수 있도록 autopilot gate policy를 명시적으로 선택하게 한다.

**Acceptance criteria:**
- [ ] `loom autopilot --non-interactive --gate auto-proceed`가 프롬프트 없이 진행된다.
- [ ] non-TTY에서 gate policy가 없으면 친절한 에러를 낸다.
- [ ] gate decision은 기존 `STATE.md` 형식으로 기록된다.

**Verification:**
- [ ] `npm run test -- tests/commands/autopilot.test.ts`
- [ ] TTY/non-TTY fixture 테스트

**Dependencies:** None

**Files likely touched:**
- `src/commands/autopilot.ts`
- `src/tui/gate.ts`
- `tests/commands/`

**Estimated scope:** Small

## Task 8: Cron Job Model

**Description:** 자연어 자동화를 구현하기 전에, 저장 가능한 cron job schema와 실행 contract를 정의한다.

**Acceptance criteria:**
- [ ] `.loom/cron/jobs.json` schema가 정의된다.
- [ ] job은 command, schedule, cwd, feature, enabled, lastRunAt, lastStatus를 가진다.
- [ ] `loom cron list`와 `loom cron run <id>`가 동작한다.

**Verification:**
- [ ] `npm run test -- tests/commands/`
- [ ] disabled job은 실행되지 않는지 검증

**Dependencies:** Task 7

**Files likely touched:**
- `src/commands/`
- `src/util/json.ts`
- `tests/commands/`

**Estimated scope:** Medium

## Task 9: Messaging Gateway Boundary

**Description:** Slack/Telegram 같은 gateway를 바로 붙이기 전에, 외부 메시지가 Loom command로 변환되는 boundary interface를 정의한다.

**Acceptance criteria:**
- [ ] gateway input은 text, sender, channel, threadId, attachments를 가진다.
- [ ] gateway output은 text, files, status, nextAction을 가진다.
- [ ] gateway는 core command를 직접 import하지 않고 adapter를 통해 호출한다.

**Verification:**
- [ ] adapter contract 단위 테스트
- [ ] CLI command와 gateway adapter가 같은 command handler를 공유하는지 검증

**Dependencies:** Task 7

**Files likely touched:**
- `src/commands/`
- `src/gateway/`
- `tests/`

**Estimated scope:** Medium

### Checkpoint: Automation

- [ ] CI에서 autopilot을 프롬프트 없이 실행할 수 있다.
- [ ] cron job은 schema와 수동 실행까지만 지원한다.
- [ ] gateway는 실제 플랫폼 연동 없이 core boundary만 존재한다.

### Phase 4: Safety And Sandboxing

## Task 10: Command Risk Classifier

**Description:** worker가 실행하려는 명령을 risk level로 분류하는 공통 classifier를 만든다.

**Acceptance criteria:**
- [ ] destructive, network, filesystem-write, git-history, secret-access risk가 분류된다.
- [ ] 알려진 safe command allowlist를 config로 둔다.
- [ ] classifier는 runtime adapter와 독립적으로 테스트된다.

**Verification:**
- [ ] `npm run test -- tests/engine/`
- [ ] `rm`, `git reset --hard`, `curl`, `npm install`, `git status` fixture 테스트

**Dependencies:** None

**Files likely touched:**
- `src/engine/`
- `src/config.ts`
- `tests/engine/`

**Estimated scope:** Medium

## Task 11: Approval Policy Hook

**Description:** 위험 명령 실행 전 approval policy가 개입할 수 있는 hook을 runtime execution path에 추가한다.

**Acceptance criteria:**
- [ ] risk classifier 결과가 worker run transcript에 기록된다.
- [ ] denied command는 실행되지 않고 worker output에 명확한 blocker로 남는다.
- [ ] dry-run에서는 command risk만 표시하고 실행하지 않는다.

**Verification:**
- [ ] `npm run test -- tests/engine/worker*.test.ts`
- [ ] denied command가 spawn되지 않는지 mock으로 검증

**Dependencies:** Task 10

**Files likely touched:**
- `src/engine/worker.ts`
- `src/engine/spawn.ts`
- `tests/engine/`

**Estimated scope:** Medium

## Task 12: Runtime Backend Capability Matrix

**Description:** Codex, Claude, Gemini, Ollama runtime별 지원 기능과 제한을 명시적으로 모델링한다.

**Acceptance criteria:**
- [ ] runtime capability는 tools, streaming, approvals, cwd support, env support를 포함한다.
- [ ] `loom doctor`가 capability matrix를 출력한다.
- [ ] unsupported 조합은 실행 전 명확한 에러를 낸다.

**Verification:**
- [ ] `npm run test -- tests/commands/doctor.test.ts`
- [ ] runtime adapter별 capability 테스트

**Dependencies:** Task 11

**Files likely touched:**
- `src/runtimes/`
- `src/commands/doctor.ts`
- `tests/runtimes/`

**Estimated scope:** Medium

### Checkpoint: Safety

- [ ] 위험 명령은 실행 전에 분류된다.
- [ ] approval policy가 없는 환경에서는 보수적으로 실패한다.
- [ ] runtime별 지원 기능 차이가 사용자에게 보인다.

### Phase 5: Evaluation And Self-Improvement

## Task 13: Trajectory Export

**Description:** feature session을 평가와 학습에 쓸 수 있는 trajectory JSON으로 export한다.

**Acceptance criteria:**
- [ ] `loom export trajectory --feature <slug>`가 JSON을 출력한다.
- [ ] JSON은 phases, prompts, worker outputs, gates, memory hits, verification results를 포함한다.
- [ ] secret-like 값은 기본적으로 redact된다.

**Verification:**
- [ ] `npm run test -- tests/commands/`
- [ ] snapshot test로 JSON shape 검증

**Dependencies:** Task 2, Task 7

**Files likely touched:**
- `src/commands/`
- `src/phases/session.ts`
- `tests/`

**Estimated scope:** Medium

## Task 14: Improvement Metrics

**Description:** Loom이 실제로 좋아지는지 판단하기 위한 기본 지표를 기록한다.

**Acceptance criteria:**
- [ ] phase duration, worker count, retry count, gate decision, test result를 metrics로 남긴다.
- [ ] `.loom/metrics/events.jsonl`에 append-only로 기록한다.
- [ ] `loom metrics summary`가 feature별 요약을 출력한다.

**Verification:**
- [ ] `npm run test -- tests/commands/`
- [ ] append-only JSONL parser 테스트

**Dependencies:** Task 7

**Files likely touched:**
- `src/commands/`
- `src/phases/runner.ts`
- `src/util/`
- `tests/`

**Estimated scope:** Medium

## Task 15: Skill Effectiveness Review

**Description:** skill이 실제 성공률을 높이는지 추적하고, 오래되거나 실패를 유발하는 skill을 review 대상으로 표시한다.

**Acceptance criteria:**
- [ ] prompt에 주입된 skill 목록이 trajectory/metrics에 기록된다.
- [ ] 실패한 phase에서 사용된 skill은 review-needed 후보가 된다.
- [ ] `loom skills review`가 후보 목록과 근거를 보여준다.

**Verification:**
- [ ] `npm run test -- tests/agents/skills.test.ts`
- [ ] 실패 fixture에서 review-needed 후보 생성 검증

**Dependencies:** Task 6, Task 13, Task 14

**Files likely touched:**
- `src/agents/skills.ts`
- `src/commands/listings.ts`
- `tests/agents/`

**Estimated scope:** Medium

### Checkpoint: Evaluation

- [ ] feature session을 JSON trajectory로 export할 수 있다.
- [ ] memory/skill 사용 여부가 metrics에 남는다.
- [ ] 실패가 다음 개선 후보로 연결된다.

## Recommended Milestones

### Milestone 1: Remember

- [ ] Task 1: Memory Store Layout
- [ ] Task 2: Memory Loader For Worker Prompts
- [ ] Task 4: Reflect-to-Memory Extractor
- [ ] Task 5: Memory Promotion Command

**Release criteria:** Loom이 feature 완료 후 기억 후보를 만들고, 사용자가 승격한 기억을 다음 phase prompt에 반영한다.

### Milestone 2: Automate Safely

- [ ] Task 7: Non-Interactive Autopilot Policy
- [ ] Task 10: Command Risk Classifier
- [ ] Task 11: Approval Policy Hook
- [ ] Task 12: Runtime Backend Capability Matrix

**Release criteria:** CI/cron 환경에서 Loom을 실행할 수 있고, 위험 명령은 실행 전 분류와 차단이 가능하다.

### Milestone 3: Learn Procedures

- [ ] Task 3: Session Search Index
- [ ] Task 6: Skill Creation Candidate
- [ ] Task 13: Trajectory Export
- [ ] Task 14: Improvement Metrics
- [ ] Task 15: Skill Effectiveness Review

**Release criteria:** Loom이 과거 session을 검색하고, 반복 절차를 skill 후보로 만들며, skill이 성과에 미친 영향을 추적한다.

### Milestone 4: Reach Users

- [ ] Task 8: Cron Job Model
- [ ] Task 9: Messaging Gateway Boundary

**Release criteria:** 플랫폼 연동 전 단계로, 저장 가능한 scheduled job과 gateway adapter contract가 준비된다.

## Parallelization Opportunities

- Task 1, Task 7, Task 10은 서로 독립적으로 시작 가능하다.
- Task 3은 Task 1 이후 독립적으로 진행 가능하다.
- Task 8과 Task 9는 Task 7 이후 별도 작업자가 병렬 진행할 수 있다.
- Task 13과 Task 14는 command surface만 먼저 합의하면 병렬 구현 가능하다.
- Task 15는 Task 6, Task 13, Task 14가 모두 끝난 뒤 진행해야 한다.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Memory가 prompt를 오염시킴 | High | memory type 분리, token budget, source/confidence 표시 |
| Skill 자동 생성이 저품질 문서를 양산 | Medium | candidate 단계 유지, 사용자 promote 필요 |
| Safety hook이 runtime별로 우회됨 | High | classifier를 engine layer에 두고 adapter별 테스트 추가 |
| Cron/gateway가 core architecture를 복잡하게 만듦 | Medium | command adapter boundary 먼저 정의 |
| Metrics가 개인정보나 secret을 저장 | High | trajectory export와 metrics에 redaction 기본 적용 |

## Open Questions

- Memory 저장 포맷은 markdown-only로 시작할지, JSON index를 같이 둘지 결정해야 한다.
- `loom memory promote`는 interactive UI가 필요한지, CLI-only로 충분한지 확인해야 한다.
- Cron runner는 Loom process가 직접 daemon이 될지, system cron/systemd timer를 생성할지 결정해야 한다.
- Gateway 1차 대상은 Slack, Telegram, Discord 중 하나로 제한해야 한다.
- Approval policy는 Codex의 기존 approval model에 위임할지, Loom 자체 policy를 먼저 적용할지 정해야 한다.

# Loom 2.0 — 예제 Feature 세션 플로우

`.loom/features/<slug>/` 한 디렉터리가 한 feature의 전체 lifecycle을 담는다.
이 문서는 한 페이지짜리 시각 요약이다.

## 디렉터리 트리

```text
.loom/features/dark-mode/
├── STATE.md                # 현재 phase, history, gates, blockers
├── CONTEXT.md              # discuss 산출물 (결정/제약/가정)
├── PLAN.md                 # plan 산출물 (AC × 모듈 × 테스트)
└── workers/
    ├── discuss/
    │   ├── ryze.md          # appendWorkerOutput로 누적 (run 단위 timestamp)
    │   ├── ryze.run/        # raw stdout/stderr/result.json
    │   ├── zilean.md
    │   └── synthesis.md     # twistedfate 합성 결과
    ├── plan/
    │   ├── ornn.md
    │   ├── orianna.md
    │   ├── hwei.md
    │   └── synthesis.md
    ├── build/
    │   ├── viktor.md
    │   ├── kayle.md
    │   └── synthesis.md
    ├── review/
    │   └── ...
    ├── verify/
    ├── ship/
    └── reflect/
```

## STATE.md 갱신 타이밍

| 시점 | STATE.md에 일어나는 일 | 책임 코드 |
|---|---|---|
| `loom phase <name>` 또는 `loom autopilot` 시작 | 세션이 없으면 `createPhaseSession`이 STATE 초기화 (`currentPhase=discuss`, `history=[discuss]`) | `phases/session.ts:createPhaseSession` |
| phase worker 호출 직전 | (변경 없음) — handoff는 STATE를 **읽기만** 한다 | `phases/runner.ts:buildHandoff` |
| phase worker 종료 후 | `advanceState`가 `currentPhase`를 새 phase로 갱신, `history`에 push, `updatedAt` 갱신 | `phases/runner.ts:advanceState` |
| 게이트 결정 입력 | `state.gates.push({phase, decision, at, note})` | `commands/phase.ts` (gate-only mode) / `commands/autopilot.ts:recordGate` |
| `--gate proceed/revise/abort` 만 호출 | spawn 없이 게이트 레코드만 추가 | `commands/phase.ts` |

## 한 사이클 (autopilot 기준)

```text
loom autopilot "Add dark mode" --feature dark-mode
  │
  ├─ createPhaseSession("dark-mode")  → STATE.md (currentPhase=discuss)
  │
  ├─ inferStartPhase("Add dark mode") → "discuss"  (또는 task에 따라 plan/build 등)
  │
  └─ for each phase from start → end:
       │
       ├─ buildHandoff(sessionDir, phase)   # STATE/CONTEXT/PLAN + 이전 phase 출력 묶음
       ├─ select personas (matrix.primary)
       ├─ runWorkerAsync × N  (병렬)
       ├─ appendWorkerOutput → workers/<phase>/<persona>.md
       ├─ (optional) twistedfate 합성 → workers/<phase>/synthesis.md
       ├─ advanceState(phase)               # STATE.history += phase
       │
       └─ gate prompt:
            • proceed → next phase
            • revise  → 같은 phase 재실행 (CONTEXT/PLAN을 사용자 수동 편집 후)
            • abort   → autopilot 종료
```

## 산출물 약속 (phase별)

| Phase | Primary 페르소나 | 산출 파일 (계약) | 후속 phase가 의존 |
|---|---|---|---|
| discuss | ryze | `CONTEXT.md` | plan |
| plan | ornn, orianna | `PLAN.md` | build, review, verify |
| build | viktor | 코드 변경 + 커밋 | review |
| review | kayle, shen | `workers/review/synthesis.md` | verify, ship |
| verify | caitlyn | `workers/verify/synthesis.md` | ship |
| ship | viktor, shen | PR URL + docs diff | reflect |
| reflect | bard | `workers/reflect/synthesis.md` (+ wrap) | (개선 백로그) |

> 정확한 매핑은 `harness/phases.md` (페르소나 매트릭스)와 각 페르소나의
> `harness/contracts/*.md`에서 확인.

## 재개 / 단발 호출 패턴

```bash
# 가장 최근 feature 세션 이어가기
loom phase build "1차 구현 — 테마 토글" --feature latest

# 한 phase만 재실행 (인풋 변경 후)
loom phase plan "API 재설계 — pagination" --feature dark-mode

# spawn 없이 게이트만 결정 기록 (예: 외부 리뷰 후)
loom phase review --feature dark-mode --gate proceed --note "외부 보안 검토 통과"

# 끝부분만 자동 진행 (build → review)
loom autopilot "Hotfix" --feature dark-mode --start build --end review
```

## 참고

- 풀 마이그레이션 가이드: `docs/MIGRATION_LOOM_2.md`
- 페르소나 매트릭스: `harness/phases.md`
- start-phase 룰: `harness/start-phase.md`
- 직렬화 포맷: `src/phases/serialize.ts`

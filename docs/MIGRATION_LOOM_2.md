# Loom v1 → v2 마이그레이션

Loom v2는 7-phase 워크플로(`discuss → plan → build → review → verify → ship → reflect`)
하나로 동작한다. v1의 단발 호출 모델(`loom run` / `loom ask` / `loom team` / 레거시 셸 / TUI)은
모두 제거됐다.

## 명령 매핑표

| v1 (제거) | v2 |
|---|---|
| `loom run "<task>"` | `loom autopilot "<task>" --feature <slug>` |
| `loom run "<task>" --agents a,b,c` | `loom phase <name> "<task>" --feature <slug> --personas a,b,c` |
| `loom ask <runtime> "<prompt>"` | (raw 런타임 호출은 1급 명령에서 빠짐. 코드에서 `runRuntime()` 직접 사용 가능) |
| `loom ask --agent <name> "<prompt>"` | `loom phase <적합한phase> "<task>" --feature <slug> --personas <name>` |
| `loom team --agents a,b,c "<task>"` | `loom phase <적합한phase> "<task>" --feature <slug> --personas a,b,c` |
| `loom shell` (legacy readline) | 제거 (CLI에서 `loom phase` / `loom autopilot` 직접 호출) |
| `loom tui` (chat UI) | 제거 (CLI에서 `loom phase` / `loom autopilot` 직접 호출) |
| `loom wrap` / `loom evolve` / `loom promote` | 제거. (phase별 산출물은 `.loom/features/<slug>/workers/`에 그대로 남는다 — v3 로드맵에 phase 기반 retro 자동화 예정) |
| `loom sessions` / `loom show` / `loom last` / `loom logs` / `loom stderr` / `loom clean` | 제거. (feature 세션은 `.loom/features/<slug>/`에서 직접 확인) |

## 디렉터리 변화

- `.loom/sessions/` → 제거. (대신 `.loom/features/<slug>/`에 phase 워커 출력 누적)
- `.loom/memory/` → 제거.
- `.loom/harness/{resources,team-decisions}/` → 제거. (v1 evolve/promote 결과 저장소였음)
- `.loom/runtime-runs/` → 신규. `loom doctor --smoke`만 사용.
- `.loom/features/<slug>/` → **새 핵심 디렉터리.** STATE.md / CONTEXT.md / PLAN.md / workers/.

## 그대로 유지된 것

- `loom init`, `loom config`, `loom doctor`, `loom agents`, `loom skills`
- `harness/prompts/*.md` 페르소나 정의 + `harness/contracts/*.md` 출력 계약
- `harness/phases.md` (페르소나 매트릭스), `harness/start-phase.md` (autopilot 시작 phase 룰)
- 페르소나 12종 (twistedfate, ryze, orianna, hwei, shen, ornn, viktor, kayle, caitlyn, zilean, bard, local-fast)

## 새 워크플로 1줄 요약

```bash
# 새 feature 시작 → 7-phase 자동 진행
loom autopilot "Add dark mode" --feature dark-mode

# 진행 중 feature의 한 phase만 다시
loom phase plan "API 재설계 — pagination" --feature dark-mode

# 외부 결정만 기록
loom phase review --feature dark-mode --gate proceed --note "외부 보안 검토 통과"
```

## 참고

- 워크플로 + 디렉터리 트리: [`docs/EXAMPLE_FEATURE_FLOW.md`](EXAMPLE_FEATURE_FLOW.md)
- 페르소나 매트릭스: `harness/phases.md`
- start-phase 룰: `harness/start-phase.md`
- 다음 작업 트랙: [`docs/LOOM_3_PROPOSAL.md`](LOOM_3_PROPOSAL.md)

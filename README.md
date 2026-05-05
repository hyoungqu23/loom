# Loom

**A 7-phase agent harness for Codex CLI, Claude Code, Gemini CLI, and local agents.**

Loom walks a feature through `discuss → plan → build → review → verify → ship → reflect`.
Each phase calls one or more role-specific agents with a structured output contract,
runs the work in parallel, then optionally synthesizes the outputs.
Per-feature state is persisted to `.loom/features/<slug>/`.

```bash
loom autopilot "환불 정책 신규 기능" --feature refund-policy
loom phase plan "API 설계 검토" --feature refund-policy
loom phase review --feature refund-policy --gate proceed --note "보안 검토 통과"
```

## Why Loom

The best agent for planning is not always the best for implementation, review, or QA.

Loom assumes:

- Codex is strong at codebase work and structured implementation.
- Claude is strong at planning, product reasoning, and strict review.
- Gemini is useful for broad critique, QA, and research-style passes.
- Local models are useful for cheap draft passes and offline checks.

Loom gives them a shared 7-phase workflow with role prompts, output contracts, and per-feature state.

```text
feature
  → phase (matrix selects personas)
    → role-specific agents
      → runtime-specific CLIs
        → structured outputs
          → Twisted Fate synthesis
            → STATE.md / CONTEXT.md / PLAN.md / workers/
              → gate decision (proceed | revise | abort)
                → next phase
```

## Commands

```bash
loom                           # bare TTY → opens Chat TUI; non-TTY → prints help
loom chat [--feature <slug>]
loom help
loom init [--cwd <dir>] [--force]
loom config show [path] | path | set <path> <value>
loom doctor [--smoke] [--runtimes codex,claude]
loom agents
loom skills
loom phase <discuss|plan|build|review|verify|ship|reflect> "<task>" --feature <slug>
                              [--gate proceed|revise|abort] [--note "<text>"]
                              [--personas <a,b>] [--include-secondary]
                              [--synthesize false] [--dry-run]
loom autopilot "<task>" --feature <slug> [--start <phase>] [--end <phase>]
                        [--include-secondary] [--synthesize false] [--dry-run]
```

`--feature` is required for `phase` and `autopilot`. Use `--feature latest` to resume the most recent feature session.
By default phases run primary personas only. Add `--include-secondary` to run the matrix secondary personas in the same phase pass.

In an interactive terminal, running `loom` with no subcommand opens the Chat TUI: a feature workspace where you chat, run phases via `/phase`, drive autopilot via `/autopilot`, and record gates with `/gate proceed|revise|abort`. Pipe redirects and CI shells fall back to the existing help output so scripts stay compatible.

## Quick Start

```bash
cd loom
npm install
npm run build
npm link

cd /your/project
loom init
loom doctor
loom autopilot "Add dark mode" --feature dark-mode
```

## Core Ideas

### 7-Phase Workflow

| Phase   | 목적                                      | 핵심 산출물        | Primary 페르소나 |
|---------|-------------------------------------------|--------------------|-------------------|
| discuss | 무엇을 만들지 명확히 한다 (grill-me)      | `CONTEXT.md`       | ryze              |
| plan    | 어떻게 만들지 결정한다 (AC × 모듈 × 테스트) | `PLAN.md`          | ornn, orianna     |
| build   | 코드를 작성한다 (TDD)                     | 코드 변경 + commits | viktor            |
| review  | 코드와 사양의 정합성을 검증한다           | `workers/review/synthesis.md` | kayle, shen |
| verify  | 시나리오 기반 QA로 동작을 확인한다        | `workers/verify/synthesis.md` | caitlyn |
| ship    | PR을 만들고 문서를 갱신한다               | PR URL + docs diff | viktor, shen      |
| reflect | 패턴을 추출하고 다음 개선 후보를 잡는다   | `workers/reflect/synthesis.md` | bard |

`twistedfate`는 모든 phase의 라우터 + 합성자다.

페르소나 매트릭스는 `harness/phases.md`가, start-phase 룰은 `harness/start-phase.md`가 정의한다.

### Multi-Runtime Workers

| Runtime | Worker mode |
|---|---|
| Codex CLI | `codex exec ...` |
| Claude Code | `claude -p ...` |
| Gemini CLI | `gemini -p ...` |
| Ollama | `ollama run ...` |

No private APIs. No reverse-engineered runtime internals. Just process orchestration.

### Agent Registry

Agents are roles with fixed runtime/model defaults. Run `loom agents` to print the current registry.

| Agent | Runtime | Model | Phase 책임 |
|---|---|---|---|
| `twistedfate` | Codex | `gpt-5.5`, medium | 모든 phase의 라우터·합성자 |
| `ryze` | Claude | `opus`, xhigh | discuss |
| `orianna` | Claude | `opus`, xhigh | plan (UX) |
| `hwei` | Gemini | `gemini-2.5-pro` | plan / review (디자인 비평) |
| `shen` | Codex | `gpt-5.5`, medium | review / ship / reflect (정합성) |
| `ornn` | Claude | `opusplan`, high | plan (기술) |
| `viktor` | Codex | `gpt-5.4`, medium | build / verify / ship |
| `kayle` | Claude | `opus`, xhigh | review (엄격) |
| `caitlyn` | Gemini | `gemini-2.5-pro` | verify (QA) |
| `zilean` | Gemini | `gemini-2.5-pro` | discuss / plan (조사) |
| `bard` | Codex | `gpt-5.4-mini`, medium | reflect |
| `local-fast` | Ollama | `qwen2.5-coder` | discuss (저비용 보조) |

### Structured Output Contracts

Every agent receives a role prompt + output contract. Contracts live in `harness/contracts/` (`default.md`, `planning.md`, `review.md`, `qa.md`, `synthesis.md`, `implementation.md`, `retrospective.md`).

### Skill-Aware Prompts

Loom bundles project skills installed through `npx skills` and injects the relevant ones into worker prompts based on the current phase.

## Feature Session Layout

```text
.loom/features/<slug>/
├── STATE.md      # current phase, history, gates, blockers
├── CONTEXT.md    # discuss artefact (problem, user, glossary, decisions)
├── PLAN.md       # plan artefact (AC × modules × tests × risks)
└── workers/
    ├── discuss/{ryze,zilean,...}.md
    ├── plan/{ornn,orianna,...}.md
    ├── build/{viktor,kayle,...}.md
    └── ...
```

A full sample is in [`docs/EXAMPLE_FEATURE_FLOW.md`](docs/EXAMPLE_FEATURE_FLOW.md).

## Gate Decisions

After each phase autopilot pauses at a gate prompt:

| Decision | Effect |
|---|---|
| `proceed` (default) | record gate, advance to next phase |
| `revise` | re-run the same phase (edit `CONTEXT.md` / `PLAN.md` to change input) |
| `abort` | record gate, exit autopilot |

`loom phase --gate proceed --note "<text>"` records a gate without spawning workers — useful for documenting offline decisions.

## Architecture

```text
loom/
  bin/loom.js
  src/
    cli.ts
    commands/{init,config,doctor,phase,autopilot,help,listings}.ts
    phases/{matrix,runner,session,start-phase,serialize}.ts
    engine/{runtime,worker,spawn,constants}.ts
    runtimes/
    agents/
  config/defaults.json
  harness/
    phases.md             # phase × persona matrix
    start-phase.md        # autopilot start-phase routing
    prompts/              # role prompts
    contracts/            # output contracts
    skills/               # bundled skills
  eval/
    structure/            # phase / persona / contract structural evals
    start-phase/          # golden start-phase routing cases
```

## Design Principles

- **No runtime monoculture.** Use the best CLI/model for each phase.
- **No hidden magic.** Every worker is a child process with logged stdout/stderr.
- **No prompt soup.** Roles, output contracts, and phase rules are markdown files.
- **No fake memory.** Per-feature state is plain markdown on disk.
- **No gate without evidence.** Every phase advance is recorded with a timestamped gate.

## Documentation

- [`docs/USAGE.md`](docs/USAGE.md) — **사용 가이드.** 시나리오별 명령 + 게이트 운용 + 트러블슈팅.
- [`docs/EXAMPLE_FEATURE_FLOW.md`](docs/EXAMPLE_FEATURE_FLOW.md) — directory tree + STATE.md update timing.
- [`docs/MIGRATION_LOOM_2.md`](docs/MIGRATION_LOOM_2.md) — v1 → v2 command mapping.
- [`docs/LOOM_3_PROPOSAL.md`](docs/LOOM_3_PROPOSAL.md) — current improvement track (Track C in progress).
- [`docs/MODELS.md`](docs/MODELS.md) — model selection notes.

# Loom Chat TUI Task Breakdown

## Goal

Build a Chat TUI experience comparable to Codex CLI and Claude Code: bare `loom` in an interactive terminal opens a feature workspace where the user can chat, run Loom phases, inspect progress, review synthesis, and control gates without memorizing CLI commands.

The existing `phase`, `autopilot`, runner, session files, and worker persistence model remain compatible. Non-TTY usage keeps the current help behavior so scripts and CI do not break.

## Architecture Decisions

- Keep `main(argv)` as a thin production wrapper. Move command dispatch into `dispatchCli(argv, deps)` so TTY behavior can be tested without mutating process globals.
- Put the new Chat TUI layer under `src/chat/` or `src/tui/chat/`. Keep the existing zero-dependency `src/tui/*` frame renderer for current phase/autopilot progress until the Chat TUI fully subsumes it.
- Use a Chat-specific session resolver for "most recent" by `STATE.md.updatedAt`, with directory `mtimeMs` fallback when state is missing or malformed. Do not reuse `resolvePhaseSession("latest")`, which currently returns the lexicographically last session directory.
- `/phase` runs one phase and returns to chat input without an automatic gate prompt. `/gate` explicitly records a gate decision. `/autopilot` waits for chat gate input after each phase.
- MVP scope is local terminal chat plus Loom execution. Full file editing and Web UI are out of scope.

## Phase 1: CLI And Session Foundation

### Task 1: Add CLI Dispatch Boundary

**Description:** Split process-global CLI wiring from command dispatch. `main(argv)` should parse production deps from `process`, while `dispatchCli(argv, deps)` decides whether to print help, start Chat TUI, or call existing handlers.

**Acceptance Criteria:**

- [ ] TTY bare `loom` dispatches to the Chat TUI starter.
- [ ] Non-TTY bare `loom` prints existing help.
- [ ] `loom help` and `loom --help` always print existing help.

**Verification:**

- [ ] `npm test -- tests/cli.test.ts`
- [ ] `npm run check`

**Dependencies:** None

**Files Likely Touched:**

- `src/cli.ts`
- `tests/cli.test.ts`

**Estimated Scope:** Medium

### Task 2: Add `loom chat` Entrypoint

**Description:** Add an explicit `loom chat` command that starts the Chat TUI regardless of whether bare `loom` would open it.

**Acceptance Criteria:**

- [ ] `loom chat` starts Chat TUI in TTY contexts.
- [ ] `loom chat --feature <slug>` passes the feature option to the Chat starter.
- [ ] Existing commands remain unchanged.

**Verification:**

- [ ] `npm test -- tests/cli.test.ts`
- [ ] Manual check: `loom chat --feature <slug>`

**Dependencies:** Task 1

**Files Likely Touched:**

- `src/cli.ts`
- `tests/cli.test.ts`

**Estimated Scope:** Small

### Task 3: Implement Chat Session Resolver

**Description:** Resolve Chat startup sessions from explicit feature, most recently updated existing session, or new feature creation.

**Acceptance Criteria:**

- [ ] Explicit `--feature <slug>` opens an existing session when present.
- [ ] Missing explicit feature creates a new session when requested by the picker flow.
- [ ] Most recent session uses `STATE.md.updatedAt`.
- [ ] Malformed or missing `STATE.md` falls back to directory `mtimeMs`.

**Verification:**

- [ ] `npm test -- tests/chat/session.test.ts`
- [ ] `npm run check`

**Dependencies:** None

**Files Likely Touched:**

- `src/chat/session.ts`
- `tests/chat/session.test.ts`
- `src/phases/session.ts` only if a small shared helper is justified

**Estimated Scope:** Medium

### Task 4: Define Chat State Model

**Description:** Add a reducer-style state model for transcript, selected feature, current phase, run options, active run state, selected detail panel, and gate waiting state.

**Acceptance Criteria:**

- [ ] State tracks selected feature and loaded session metadata.
- [ ] State tracks options for personas, secondary inclusion, and synthesis.
- [ ] State can render `/status` from a single state snapshot.

**Verification:**

- [ ] `npm test -- tests/chat/state.test.ts`
- [ ] `npm run check`

**Dependencies:** Task 3

**Files Likely Touched:**

- `src/chat/state.ts`
- `tests/chat/state.test.ts`

**Estimated Scope:** Medium

## Checkpoint 1: Foundation

- [ ] `npm run check`
- [ ] `npm test -- tests/cli.test.ts tests/chat/session.test.ts tests/chat/state.test.ts`
- [ ] Confirm bare non-TTY behavior is still script-compatible.

## Phase 2: Commands And Execution Bridge

### Task 5: Implement Slash Command Parser

**Description:** Parse deterministic Chat commands separately from natural language input.

**Acceptance Criteria:**

- [ ] Parser supports `/phase <name> [task]`, `/autopilot <task>`, `/gate proceed|revise|abort [note]`, `/personas <a,b>`, `/secondary on|off`, `/synthesize on|off`, `/status`, `/open <target>`, `/help`, and `/quit`.
- [ ] Invalid commands return structured parse errors.
- [ ] Plain text input is classified separately from slash commands.

**Verification:**

- [ ] `npm test -- tests/chat/commands.test.ts`

**Dependencies:** Task 4

**Files Likely Touched:**

- `src/chat/commands.ts`
- `tests/chat/commands.test.ts`

**Estimated Scope:** Medium

### Task 6: Bridge Chat Options To Phase Options

**Description:** Apply `/personas`, `/secondary`, and `/synthesize` to future phase and autopilot runs.

**Acceptance Criteria:**

- [ ] `/secondary on` sets `includeSecondary` for future runs.
- [ ] `/personas zilean` overrides secondary inclusion.
- [ ] `/synthesize off` disables synthesis for future runs.

**Verification:**

- [ ] `npm test -- tests/chat/state.test.ts tests/chat/commands.test.ts`

**Dependencies:** Task 5

**Files Likely Touched:**

- `src/chat/state.ts`
- `src/chat/commands.ts`
- `tests/chat/state.test.ts`

**Estimated Scope:** Small

### Task 7: Extract Gate Persistence Logic

**Description:** Move gate recording into a reusable phase/session helper so CLI and Chat use the same persistence path.

**Acceptance Criteria:**

- [ ] Existing `loom phase --gate ...` behavior still works.
- [ ] Existing autopilot gate recording still works.
- [ ] Chat can record gate decisions through the same helper.

**Verification:**

- [ ] `npm test -- tests/commands/phase.test.ts tests/commands/autopilot.test.ts`
- [ ] `npm run check`

**Dependencies:** None

**Files Likely Touched:**

- `src/phases/gate.ts`
- `src/commands/phase.ts`
- `src/commands/autopilot.ts`
- `tests/commands/phase.test.ts`
- `tests/commands/autopilot.test.ts`

**Estimated Scope:** Medium

### Task 8: Wire `/phase` To `runPhase`

**Description:** Execute a single Loom phase from Chat and append run lifecycle events to the transcript.

**Acceptance Criteria:**

- [ ] `/phase discuss <task>` calls `runPhase`.
- [ ] Worker output and `STATE.md` are updated through existing runner/session APIs.
- [ ] Phase completion returns to input without automatic gate prompt.

**Verification:**

- [ ] `npm test -- tests/chat/runtime.test.ts tests/phases/runner.test.ts`
- [ ] Manual check: `/phase discuss <task>` inside Chat TUI

**Dependencies:** Tasks 3, 5, 6

**Files Likely Touched:**

- `src/chat/runtime.ts`
- `tests/chat/runtime.test.ts`

**Estimated Scope:** Medium

### Task 9: Wire `/gate` To Gate Persistence

**Description:** Record explicit Chat gate decisions and make revise notes available to the next relevant phase prompt.

**Acceptance Criteria:**

- [ ] `/gate revise <note>` persists a revise gate record.
- [ ] The next run of the same phase includes the revise note as a revision hint.
- [ ] `/gate proceed` clears stale revise hints by existing prompt behavior.

**Verification:**

- [ ] `npm test -- tests/chat/runtime.test.ts tests/agents/prompt-phase.test.ts`

**Dependencies:** Task 7

**Files Likely Touched:**

- `src/chat/runtime.ts`
- `tests/chat/runtime.test.ts`

**Estimated Scope:** Small

## Checkpoint 2: Headless Chat Runtime

- [ ] `npm run check`
- [ ] `npm test -- tests/chat tests/commands/phase.test.ts tests/commands/autopilot.test.ts`
- [ ] Confirm Chat command handling can be tested without Ink.

## Phase 3: Ink Chat TUI

### Task 10: Add Ink Compatibility Wrapper

**Description:** Add Ink dependency and isolate loading behind a wrapper compatible with the current CommonJS build.

**Acceptance Criteria:**

- [ ] Chat module loads without ESM/CJS runtime errors.
- [ ] `npm run check` passes.
- [ ] Wrapper is narrow enough that non-Chat CLI paths do not eagerly load Ink.

**Verification:**

- [ ] `npm run check`
- [ ] `npm test -- tests/chat/ink.test.ts`

**Dependencies:** Task 1

**Files Likely Touched:**

- `package.json`
- `package-lock.json`
- `src/chat/ink.ts`
- `tests/chat/ink.test.ts`

**Estimated Scope:** Medium

### Task 11: Build Basic Chat Layout

**Description:** Render the first usable Chat TUI screen: header, transcript, detail panel, footer, and input line.

**Acceptance Criteria:**

- [ ] Header shows feature, current phase, active run state, and gate status.
- [ ] Transcript shows user and Loom system messages.
- [ ] Footer accepts input and displays compact command hints.

**Verification:**

- [ ] `npm test -- tests/chat/app.test.ts`
- [ ] Manual TTY smoke: `loom chat --feature <slug>`

**Dependencies:** Tasks 4, 10

**Files Likely Touched:**

- `src/chat/App.tsx`
- `src/chat/components/*`
- `tests/chat/app.test.ts`

**Estimated Scope:** Medium

### Task 12: Connect Transcript Events

**Description:** Convert command parse results, run lifecycle events, errors, and gate state transitions into transcript entries.

**Acceptance Criteria:**

- [ ] Bad commands appear as transcript errors without exiting Chat.
- [ ] Run start, run completion, and run failure are visible.
- [ ] Gate waiting state is represented distinctly from idle input.

**Verification:**

- [ ] `npm test -- tests/chat/transcript.test.ts tests/chat/app.test.ts`

**Dependencies:** Tasks 8, 9, 11

**Files Likely Touched:**

- `src/chat/transcript.ts`
- `src/chat/App.tsx`
- `tests/chat/transcript.test.ts`

**Estimated Scope:** Medium

### Task 13: Connect Live Phase Progress

**Description:** Surface worker progress and synthesis completion in the Chat UI using existing runner hooks or a small event adapter.

**Acceptance Criteria:**

- [ ] Active worker names and status update during a phase run.
- [ ] Synthesis status appears when synthesis starts and completes.
- [ ] Non-Chat phase/autopilot rendering remains unchanged.

**Verification:**

- [ ] `npm test -- tests/chat/runtime.test.ts tests/phases/runner.test.ts tests/tui`
- [ ] Manual TTY smoke: run `/phase` and watch progress update.

**Dependencies:** Tasks 8, 12

**Files Likely Touched:**

- `src/chat/runtime.ts`
- `src/chat/App.tsx`
- `src/phases/runner.ts` only if hook surface needs a small extension
- `tests/chat/runtime.test.ts`

**Estimated Scope:** Medium

## Checkpoint 3: Usable Chat MVP

- [ ] `npm run check`
- [ ] `npm test -- tests/chat tests/tui tests/phases/runner.test.ts`
- [ ] Manual smoke: `loom`, `loom chat --feature <slug>`, `/phase discuss <task>`, `/quit`

## Phase 4: Autopilot And Detail Views

### Task 14: Implement Chat Autopilot Loop

**Description:** Run `/autopilot <task>` inside Chat, pausing after each phase for chat gate input.

**Acceptance Criteria:**

- [ ] `proceed` advances to the next phase.
- [ ] `revise` reruns the same phase with the same task and revise note context.
- [ ] `abort` stops the loop and returns to idle input.

**Verification:**

- [ ] `npm test -- tests/chat/autopilot.test.ts tests/commands/autopilot.test.ts`
- [ ] Manual smoke: `/autopilot <task>` with proceed/revise/abort.

**Dependencies:** Tasks 8, 9, 12

**Files Likely Touched:**

- `src/chat/autopilot.ts`
- `src/chat/runtime.ts`
- `tests/chat/autopilot.test.ts`

**Estimated Scope:** Medium

### Task 15: Add Synthesis-First Detail Panel

**Description:** Make synthesis the default detail view after a phase run, with worker summaries as fallback.

**Acceptance Criteria:**

- [ ] Detail panel prefers `workers/<phase>/synthesis.md` when present.
- [ ] Detail panel falls back to worker summary when synthesis is absent.
- [ ] Detail panel updates after each phase run.

**Verification:**

- [ ] `npm test -- tests/chat/detail.test.ts tests/chat/app.test.ts`

**Dependencies:** Tasks 12, 13

**Files Likely Touched:**

- `src/chat/detail.ts`
- `src/chat/App.tsx`
- `tests/chat/detail.test.ts`

**Estimated Scope:** Small

### Task 16: Implement File Preview Commands

**Description:** Add `/open context`, `/open plan`, `/open workers`, and `/open synthesis` previews.

**Acceptance Criteria:**

- [ ] Existing files render concise previews.
- [ ] Missing files show clear empty states.
- [ ] `/open workers` lists per-phase worker outputs without loading unbounded content.

**Verification:**

- [ ] `npm test -- tests/chat/files.test.ts tests/chat/runtime.test.ts`

**Dependencies:** Task 15

**Files Likely Touched:**

- `src/chat/files.ts`
- `src/chat/runtime.ts`
- `tests/chat/files.test.ts`

**Estimated Scope:** Medium

## Phase 5: Polish, Docs, And Verification

### Task 17: Harden Cancellation And Error UX

**Description:** Handle Ctrl+C, active run cancellation intent, bad commands, missing sessions, and Chat shutdown without corrupting terminal state.

**Acceptance Criteria:**

- [ ] Ctrl+C exits cleanly when idle.
- [ ] Ctrl+C during a run presents or records a clean cancellation path.
- [ ] Errors become transcript messages and do not leave Ink in a broken terminal state.

**Verification:**

- [ ] `npm test -- tests/chat/app.test.ts tests/chat/runtime.test.ts`
- [ ] Manual TTY smoke: Ctrl+C while idle and during a run.

**Dependencies:** Tasks 13, 14

**Files Likely Touched:**

- `src/chat/App.tsx`
- `src/chat/runtime.ts`
- `tests/chat/app.test.ts`

**Estimated Scope:** Medium

### Task 18: Update Docs And Help

**Description:** Document Chat TUI as the primary TTY workflow while preserving script-compatible non-TTY behavior.

**Acceptance Criteria:**

- [ ] README mentions bare `loom` opening Chat TUI in interactive terminals.
- [ ] `docs/USAGE.md` documents `loom chat`, `--feature`, and core slash commands.
- [ ] `loom help` mentions `chat` and TTY behavior.

**Verification:**

- [ ] `npm test -- tests/commands/help.test.ts`
- [ ] Manual check: `loom help`

**Dependencies:** Task 2

**Files Likely Touched:**

- `README.md`
- `docs/USAGE.md`
- `src/commands/help.ts`
- `tests/commands/help.test.ts`

**Estimated Scope:** Small

### Task 19: Add End-To-End Smoke Coverage

**Description:** Add final smoke coverage for CLI dispatch, Chat render, phase execution, and autopilot gate flow.

**Acceptance Criteria:**

- [ ] TTY bare `loom` opens Chat TUI.
- [ ] Piped/non-TTY bare `loom` prints help.
- [ ] `/phase` and `/autopilot` core flows are covered.

**Verification:**

- [ ] `npm run check`
- [ ] `npm run test`
- [ ] Manual TTY smoke: `loom`, `loom chat --feature <slug>`, `/phase discuss <task>`, `/autopilot <task>`, `/quit`

**Dependencies:** Tasks 17, 18

**Files Likely Touched:**

- `tests/chat/*`
- `tests/cli.test.ts`

**Estimated Scope:** Medium

## Risks And Mitigations

| Risk                                            | Impact | Mitigation                                                                        |
| ----------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| Ink ESM/CJS mismatch                            | High   | Keep Ink behind a lazy wrapper and test module loading before UI work expands.    |
| Chat UI couples too tightly to runner internals | Medium | Use event adapters/hooks and keep `runPhase` as the orchestration boundary.       |
| Bare `loom` breaks scripts                      | High   | Gate Chat startup on interactive TTY only and test non-TTY help behavior.         |
| "Latest" session surprises users                | Medium | Use `STATE.md.updatedAt`, not directory sorting; show selected session in header. |
| Autopilot gate logic diverges from CLI behavior | Medium | Extract shared gate persistence before implementing Chat autopilot.               |
| Tasks become too wide once UI starts            | Medium | Finish headless parser/state/runtime first, then attach Ink rendering.            |

## Parallelization Opportunities

- Tasks 3 and 7 can run in parallel after Task 1 starts because they touch separate areas.
- Tasks 5 and 10 can run in parallel after state shape is agreed.
- Task 18 can run once Task 2 behavior is stable; it does not need to wait for full UI polish.
- Avoid parallel edits across `src/chat/App.tsx` and shared Chat state until Task 11 establishes component boundaries.

## Suggested Implementation Order

1. Tasks 1-4 establish dispatch, session resolution, and state.
2. Tasks 5-9 create a fully testable headless Chat runtime.
3. Tasks 10-13 attach the Ink UI and live phase progress.
4. Tasks 14-16 add autopilot and detail/file views.
5. Tasks 17-19 harden UX, docs, and final verification.

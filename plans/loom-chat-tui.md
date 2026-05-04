# Loom Chat TUI Implementation Plan

## Summary

Loom's main interaction should feel like a feature workspace with an agent team chat, not a collection of memorized CLI commands. Add an Ink-based Chat TUI as the primary TTY experience while preserving the existing `phase`, `autopilot`, runner, session, and file persistence model.

Bare `loom` should open the Chat TUI only in an interactive TTY. Non-TTY bare `loom`, `loom help`, and `loom --help` should keep the current help behavior.

## Key Changes

- Public CLI:
  - TTY bare `loom` opens Chat TUI.
  - Non-TTY bare `loom`, `loom help`, and `loom --help` print existing help.
  - Add `loom chat` as an explicit Chat TUI entrypoint.
  - Support `loom chat --feature <slug>` to open an existing or newly created feature session.
  - If `--feature` is absent, prompt for latest session selection or new feature creation.

- Chat interaction model:
  - Plain natural language becomes the current feature task or revise note, depending on context.
  - Slash commands provide deterministic control:
    - `/phase <name> [task]`
    - `/autopilot <task>`
    - `/gate proceed|revise|abort [note]`
    - `/personas <a,b>`
    - `/secondary on|off`
    - `/synthesize on|off`
    - `/status`
    - `/open synthesis|context|plan|workers`
    - `/help`
    - `/quit`
  - Default execution behavior stays compatible with existing Loom defaults: primary personas only, synthesis on, interactive gate.

- Ink TUI architecture:
  - Use Ink only for the new Chat TUI layer.
  - Keep the existing zero-dependency frame renderer for current phase/autopilot progress.
  - Because the project currently compiles to CommonJS, isolate Ink loading behind a compatibility wrapper using dynamic import or a pinned compatible Ink version.
  - Reuse engine/session APIs instead of reimplementing orchestration:
    - Phase execution via `runPhase`.
    - Gate persistence via extracted reusable gate-recording logic.
    - Session reads via existing state/context/plan/session helpers.

- Layout:
  - Header: feature, current phase, worker count, gate status.
  - Main panel: chat transcript and Loom system messages.
  - Detail panel: synthesis by default, switchable to workers/context/plan.
  - Footer: input line and command hints.

## Task + Priority List

| Priority | Task | Description | Acceptance Criteria |
|---|---|---|---|
| P0 | Chat command entrypoint | Add TTY-aware bare `loom` behavior and explicit `loom chat`. | TTY bare `loom` calls Chat TUI; non-TTY bare `loom` and help flags still print help. |
| P0 | Ink dependency and wrapper | Add Ink in a way compatible with the current CommonJS build. | `npm run check` passes and the Chat TUI module loads without ESM/CJS runtime errors. |
| P0 | Session picker/create flow | Resolve `--feature`, latest session, or new feature creation. | Existing session, latest session, and new session paths are covered by tests. |
| P0 | Chat state model | Track transcript, selected feature, current phase, run options, and active run state. | `/status` displays state, context/plan presence, and current phase. |
| P0 | Slash command parser | Parse deterministic chat commands separately from plain text. | Parser tests cover phase, autopilot, gate, personas, secondary, synthesize, help, and quit. |
| P0 | Phase run from chat | Wire `/phase <phase> <task>` to `runPhase`. | Phase execution updates session state and shows worker/synthesis summary in the transcript. |
| P0 | Gate UX | Support `/gate proceed|revise|abort [note]` from chat. | Gate records are persisted; revise notes appear as revision hints in the next relevant run. |
| P1 | Autopilot chat loop | Run `/autopilot <task>` inside chat, pausing for chat gate input after each phase. | Proceed advances, revise reruns the same phase, abort stops the loop. |
| P1 | Synthesis-first detail panel | Show synthesis as the default phase result, with raw workers available on demand. | Synthesis is preferred when present; worker summary fallback appears when absent. |
| P1 | Options bridge | Apply `/personas`, `/secondary`, and `/synthesize` to future runs. | `/secondary on` increases worker count; `/personas` takes precedence over secondary inclusion. |
| P1 | Error and cancellation UX | Handle worker failures, bad commands, missing sessions, and Ctrl+C gracefully. | Errors become transcript messages and do not corrupt terminal state. |
| P2 | File preview commands | Add `/open context`, `/open plan`, `/open workers`, and `/open synthesis`. | Existing files render previews; missing files show clear empty states. |
| P2 | Docs and help refresh | Document Chat TUI as the main TTY workflow. | README, USAGE, and `loom help` mention bare `loom` TTY behavior and `loom chat`. |
| P2 | Snapshot and interaction tests | Add component and CLI dispatch tests for Chat TUI. | New tests pass alongside existing TUI, CLI, phase, and autopilot tests. |

## Test Plan

- Unit tests:
  - Slash command parser.
  - Chat option state reducer.
  - Session resolution for explicit feature, latest, and new feature.
  - Gate command parsing and note persistence.

- CLI tests:
  - `main([])` with a TTY mock calls Chat TUI.
  - `main([])` with a non-TTY mock prints existing help.
  - `main(["chat", "--feature", "x"])` calls Chat TUI.
  - `main(["--help"])` always prints help.

- Integration tests:
  - Chat `/phase discuss <task>` creates worker output and updates `STATE.md`.
  - `/secondary on` runs discuss with `ryze`, `zilean`, and `local-fast`.
  - `/personas zilean` overrides `/secondary on`.
  - `/gate revise <note>` persists the note and feeds the next phase prompt as a revision hint.
  - `/autopilot <task>` supports proceed, revise, and abort flow.

- Full verification:
  - `npm run check`
  - `npm run test`
  - Manual TTY smoke: `loom`, `loom chat --feature <slug>`, phase run, gate input, Ctrl+C exit.

## Assumptions

- MVP scope is local chat plus execution, not a Web UI or full file editor.
- Existing `phase` and `autopilot` commands remain fully compatible.
- Bare `loom` changes behavior only in interactive TTY contexts to avoid breaking scripts and CI.
- Natural language intent parsing is conservative in v1. Ambiguous input should ask for clarification or suggest slash commands instead of executing risky actions.
- The existing zero-dependency TUI frame stays in place until the Chat TUI proves it can replace or subsume it safely.

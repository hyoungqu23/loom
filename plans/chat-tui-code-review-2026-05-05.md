# Chat TUI Code Review - 2026-05-05

## Scope

Reviewed the committed Chat TUI work on top of the pre-TUI baseline, focusing on the TypeScript/Ink runtime, chat command controller, autopilot loop, session resolution, transcript/detail rendering, and tests. Existing unstaged plan edits were left untouched.

## Verification

- `npm run check`: passed
- `npm test`: passed, 83 test files and 916 tests

## Findings

### High: Autopilot stop leaves the chat in a stale gate-waiting state

`autopilot-stop` clears only `state.autopilot`, but it does not reset `state.run`. See `src/chat/state.ts:112`. Both completion paths and abort paths rely on that action in `src/chat/runtime.ts:208`, `src/chat/runtime.ts:219`, and `src/chat/runtime.ts:269`.

Impact:

- After `/gate abort`, the loop is no longer running, but the header can still display `run=paused` and `gate=waiting <phase>` because `src/chat/App.ts:18` and `src/chat/App.ts:25` render from `state.run`.
- A later `/gate` without an explicit phase can still target the stale waiting phase because the runtime prioritizes `state.run.status === "waiting-for-gate"` in `src/chat/runtime.ts:357`.
- The test name says "returns to idle", but the assertion locks in the stale state at `tests/chat/autopilot.test.ts:171` and `tests/chat/autopilot.test.ts:191`.

Recommendation:

Change `autopilot-stop` to also set `run: { status: "idle" }`, or add a separate runtime action for "stop and clear wait". Update the abort and completion tests to assert idle state after the loop stops. If manual gates must remain possible after abort, require an explicit phase argument instead of preserving a hidden waiting phase.

### Medium: Initial chat status ignores existing CONTEXT.md and PLAN.md

`startChat` loads persisted phase state, then creates the initial chat state without passing `hasContext` or `hasPlan`. See `src/chat/start.ts:25` and `src/chat/start.ts:26`.

The `/refresh` command has the correct file checks at `src/chat/runtime.ts:431`, but users who resume a session and immediately run `/status` will see `context=no plan=no` until they manually refresh, even when the artifacts already exist.

Impact:

- The first screen/status can misrepresent resumed sessions.
- The Chat TUI is meant to be the primary TTY workflow, so resumed state should be accurate before the user runs a command.

Recommendation:

Move the artifact-presence check into a small shared helper, then use it in both `startChat` and `/refresh`. Add coverage in `tests/chat/start.test.ts` for an existing session with `CONTEXT.md` and `PLAN.md`.

## Design Notes

- The ESM migration is coherent: `package.json` uses `"type": "module"`, TypeScript uses `NodeNext`, and the binary imports `dist/cli.js`.
- The runtime command union is covered with an exhaustiveness check in `src/chat/runtime.ts:488`.
- Transcript growth is bounded, and preview constants are centralized.
- Markdown detail rendering is parser-based and does not execute HTML.
- Ctrl+C behavior is honest but limited: first press records a notice, second press exits the UI while the child process can continue. See `src/chat/Interactive.ts:45`. This is acceptable for now if documented as "force exit", but it is not true cancellation.

## Suggested Follow-up Tasks

1. Fix `autopilot-stop` so stopped autopilot returns to idle run state.
2. Add tests for abort, configured end-phase completion, and final reflect completion all returning to idle.
3. Share session artifact detection between startup and `/refresh`.
4. Add a startup test that resumes a session with `CONTEXT.md` and `PLAN.md` and verifies initial `/status` state.
5. Track true run cancellation as a later feature if Chat TUI should match Codex CLI and Claude Code behavior more closely.

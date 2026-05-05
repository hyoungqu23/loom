export function printHelp(): void {
  console.log(`loom — 7-phase agent harness

Usage:
  loom                         Bare invocation: opens Chat TUI on a TTY; prints
                               this help when stdout is not a terminal (CI, pipes).
  loom chat [--feature <slug>] Open the Chat TUI explicitly. Without --feature
                               resumes the most recently updated session.
  loom help                    Show this help
  loom init [--cwd <dir>] [--force]
  loom config show [path] | path | set <path> <value>
  loom doctor [--smoke] [--runtimes codex,claude]
  loom agents
  loom skills
  loom memory list | search "<query>" | promote <id> --type user|project|procedure | reject <id>
  loom metrics summary
  loom cron list | run <id>          (edit .loom/cron/jobs.json to add jobs)
  loom export trajectory --feature <slug>
  loom phase <discuss|plan|build|review|verify|ship|reflect> "<task>" --feature <slug>
                               [--gate proceed|revise|abort] [--note "<text>"]
                               [--personas <a,b>] [--include-secondary]
                               [--synthesize false] [--dry-run]
  loom autopilot "<task>" --feature <slug> [--start <phase>] [--end <phase>]
                          [--include-secondary] [--synthesize false] [--dry-run]
                          [--non-interactive --gate auto-proceed]

Workflow:
  discuss → plan → build → review → verify → ship → reflect

  Each invocation needs --feature <slug> so per-feature state lives under
  .loom/features/<slug>/. Use --feature latest to resume the most recent
  feature session.

Chat slash commands (inside loom chat):
  /phase <name> [task]   Run a single phase from chat
  /autopilot [--start <phase>] [--end <phase>] <task>
                         Loop through phases (default: currentPhase or
                         inferred → reflect), pausing for /gate after each
  /gate proceed|revise|abort [phase] [note]
                         Record a gate decision (optionally targeting a
                         specific phase); drives autopilot too
  /personas a,b          Override personas for future runs
  /secondary on|off      Include / exclude matrix secondary personas
  /synthesize on|off     Toggle the twistedfate synthesis pass
  /open context|plan|workers|synthesis
                         Preview the named artefact in the detail panel
  /status                Print the current chat / session snapshot
  /refresh               Re-read STATE.md / CONTEXT.md / PLAN.md after editing
                         the files outside the chat session
  /help                  Show the slash-command list inside the TUI
  /quit                  Exit the chat session (Ctrl+C also exits when idle)

Examples:
  loom                                # opens chat in a TTY
  loom chat --feature billing-v2      # opens chat for a specific feature
  loom init
  loom doctor --smoke
  loom memory list
  loom memory search "auth retry"
  loom cron list
  loom autopilot "환불 정책 신규 기능" --feature refund-policy
  loom phase discuss "기획 초안 정리" --feature billing-v2
  loom phase discuss "기획 초안 정리" --feature billing-v2 --include-secondary
  loom phase plan    "API 설계"      --feature billing-v2
  loom phase review  --feature billing-v2 --gate proceed --note "보안 검토 통과"
  loom autopilot "Hotfix" --feature latest --start build --end review
  loom autopilot "Nightly QA" --feature nightly-qa --non-interactive --gate auto-proceed
`);
}

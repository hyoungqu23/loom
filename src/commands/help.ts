export function printHelp(): void {
  console.log(`loom — 7-phase agent harness

Usage:
  loom help                    Show this help
  loom init [--cwd <dir>] [--force]
  loom config show [path] | path | set <path> <value>
  loom doctor [--smoke] [--runtimes codex,claude]
  loom agents
  loom skills
  loom phase <discuss|plan|build|review|verify|ship|reflect> "<task>" --feature <slug>
                               [--gate proceed|revise|abort] [--note "<text>"]
                               [--personas <a,b>] [--synthesize false] [--dry-run]
  loom autopilot "<task>" --feature <slug> [--start <phase>] [--end <phase>]
                          [--synthesize false] [--dry-run]

Workflow:
  discuss → plan → build → review → verify → ship → reflect

  Each invocation needs --feature <slug> so per-feature state lives under
  .loom/features/<slug>/. Use --feature latest to resume the most recent
  feature session.

Examples:
  loom init
  loom doctor --smoke
  loom autopilot "환불 정책 신규 기능" --feature refund-policy
  loom phase discuss "기획 초안 정리" --feature billing-v2
  loom phase plan    "API 설계"      --feature billing-v2
  loom phase review  --feature billing-v2 --gate proceed --note "보안 검토 통과"
  loom autopilot "Hotfix" --feature latest --start build --end review
`);
}

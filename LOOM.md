# LOOM

This project is managed by Loom — a 7-phase agent harness.

## Common Commands

```bash
npm install
npm run build
loom doctor
loom doctor --smoke --runtimes codex,claude
loom config show agents.kayle
loom agents
loom autopilot "Plan and review this change" --feature my-feature
loom phase discuss "PRD 초안" --feature my-feature
loom phase plan    "API 설계"  --feature my-feature
loom phase review  --feature my-feature --gate proceed --note "ok"
```

## 7-Phase Workflow

`discuss → plan → build → review → verify → ship → reflect`

Each invocation needs `--feature <slug>`. Per-feature state lives under
`.loom/features/<slug>/` (`STATE.md`, `CONTEXT.md`, `PLAN.md`, `workers/`).

Use `loom phase` for one step, or `loom autopilot` to walk all phases with a
gate prompt between them.

## Local State

- `.loom/config.json` — runtime and agent overrides for this project.
- `.loom/features/` — per-feature 7-phase sessions.
- `.loom/runtime-runs/` — raw transcripts from `loom doctor --smoke` runtime checks.

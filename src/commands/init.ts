import * as fs from "fs";
import * as path from "path";
import { Flags } from "../types";
import {
  ensureWorkspaceState,
  setActiveWorkspace,
  workspaceRoot,
  defaultsPath,
} from "../workspace";
import { flagBool, flagString } from "../util/parse-args";

function writeFileIfMissing(
  filePath: string,
  content: string,
  force: boolean,
): boolean {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && !force) return false;
  fs.writeFileSync(filePath, content);
  return true;
}

const LOOM_GUIDE = [
  "# LOOM",
  "",
  "This project is managed by Loom — a 7-phase agent harness.",
  "",
  "## Common Commands",
  "",
  "```bash",
  "loom doctor",
  'loom autopilot "Plan and review this change" --feature my-feature',
  'loom phase discuss "PRD 초안" --feature my-feature',
  'loom phase review --feature my-feature --gate proceed --note "ok"',
  "```",
  "",
  "## 7-Phase Workflow",
  "",
  "`discuss → plan → build → review → verify → ship → reflect`",
  "",
  "Each invocation needs `--feature <slug>`. Per-feature state lives under",
  "`.loom/features/<slug>/`:",
  "",
  "```text",
  ".loom/features/<slug>/",
  "├── STATE.md      # current phase, history, gates, blockers",
  "├── CONTEXT.md    # discuss artefact (decisions, constraints, glossary)",
  "├── PLAN.md       # plan artefact (AC × modules × tests)",
  "└── workers/      # raw worker stdout per phase",
  "```",
  "",
  "Use `loom phase` for one step, or `loom autopilot` to walk all phases with",
  "a gate prompt between them.",
  "",
  "## Local State",
  "",
  "- `.loom/config.json` — runtime and agent overrides for this project.",
  "- `.loom/features/` — per-feature 7-phase sessions (STATE / CONTEXT / PLAN + workers).",
  "- `.loom/runtime-runs/` — raw transcripts from `loom doctor --smoke` runtime checks.",
  "",
].join("\n");

export function initWorkspace(flags: Flags): { stateRoot: string } {
  const cwd = flagString(flags.cwd) || workspaceRoot();
  setActiveWorkspace(path.resolve(cwd));
  const force = flagBool(flags.force);

  const stateRoot = ensureWorkspaceState();
  const defaultsContent = fs.readFileSync(defaultsPath(), "utf8");

  const configChanged = writeFileIfMissing(
    path.join(stateRoot, "config.json"),
    defaultsContent.endsWith("\n") ? defaultsContent : `${defaultsContent}\n`,
    force,
  );

  const loomDocChanged = writeFileIfMissing(
    path.join(workspaceRoot(), "LOOM.md"),
    LOOM_GUIDE,
    force,
  );

  console.log(`[loom] workspace: ${workspaceRoot()}`);
  console.log(`[loom] state: ${stateRoot}`);
  console.log(
    `[loom] config: ${path.join(stateRoot, "config.json")}${configChanged ? " created" : " exists"}`,
  );
  console.log(
    `[loom] guide: ${path.join(workspaceRoot(), "LOOM.md")}${loomDocChanged ? " created" : " exists"}`,
  );

  return { stateRoot };
}

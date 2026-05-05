import * as fs from "fs";
import * as path from "path";
import { AgentConfig, InstalledSkill, SkillMetadata } from "../types.js";
import { getPackageRoot } from "../workspace.js";
import { workspaceRoot } from "../workspace.js";

const SKILLS_DIR_REL = path.join(".agents", "skills");

export function installedSkills(): InstalledSkill[] {
  const skillsDir = path.join(getPackageRoot(), SKILLS_DIR_REL);
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir)
    .map((name) => ({
      name,
      path: path.join(skillsDir, name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readSkillMetadata(skillPath: string): SkillMetadata | null {
  const skillFile = path.join(skillPath, "SKILL.md");
  if (!fs.existsSync(skillFile)) return null;
  const content = fs.readFileSync(skillFile, "utf8");
  const metadata: SkillMetadata = {
    name: path.basename(skillPath),
    path: skillFile,
    description: "",
  };

  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatter) {
    const body = frontmatter[1];
    for (const line of body.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      const value = match[2].replace(/^["']|["']$/g, "");
      if (key === "description") metadata.description = value;
      if (key === "name") metadata.name = value;
    }
  }

  const when = content.match(/## When to Use\s*\n([\s\S]*?)(\n## |\n# |$)/i);
  if (when) {
    metadata.whenToUse = when[1].trim().split(/\r?\n/).slice(0, 8).join("\n");
  }

  return metadata;
}

export function skillCatalog(): SkillMetadata[] {
  const out: SkillMetadata[] = [];
  for (const skill of installedSkills()) {
    const metadata = readSkillMetadata(skill.path);
    if (metadata) out.push(metadata);
  }
  return out;
}

const KEYWORD_PATTERNS: Array<{ regex: RegExp; skills: string[] }> = [
  {
    regex: /(plan|planning|prd|scope|architecture|spec|기획|계획|설계|요구사항)/i,
    skills: ["planning-and-task-breakdown", "context-engineering"],
  },
  {
    regex: /(review|quality|merge|diff|bug|risk|리뷰|검토|위험)/i,
    skills: ["code-review-and-quality"],
  },
  {
    regex: /(test|qa|verify|verification|failing|regression|검증|테스트)/i,
    skills: ["test-driven-development", "debugging-and-error-recovery"],
  },
  {
    regex: /(docs|documentation|adr|decision|문서|결정|기록)/i,
    skills: ["documentation-and-adrs"],
  },
  {
    regex: /(security|auth|permission|secret|pii|보안|인증|권한)/i,
    skills: ["security-and-hardening"],
  },
  {
    regex: /(official|source|framework|library|api|latest|공식|최신)/i,
    skills: ["source-driven-development"],
  },
  {
    regex: /(mcp|tool server|integration|외부 도구)/i,
    skills: ["mcp-builder"],
  },
  {
    regex: /(skill|workflow|agent skill|스킬)/i,
    skills: ["skill-creator"],
  },
  {
    regex: /(implement|fix|build|code|구현|수정|개발)/i,
    skills: ["test-driven-development", "source-driven-development"],
  },
];

const AGENT_DEFAULT_SKILLS: { [agent: string]: string[] } = {
  twistedfate: ["context-engineering", "documentation-and-adrs"],
  bard: ["context-engineering", "documentation-and-adrs"],
};

export function relevantSkillNames(
  agentName: string,
  agent: AgentConfig,
  task: string,
): string[] {
  const text = `${agentName} ${agent.contract || ""} ${agent.description || ""} ${task}`;
  const names = new Set<string>();

  for (const { regex, skills } of KEYWORD_PATTERNS) {
    if (regex.test(text)) {
      for (const skill of skills) names.add(skill);
    }
  }

  const defaults = AGENT_DEFAULT_SKILLS[agentName];
  if (defaults) {
    for (const skill of defaults) names.add(skill);
  }

  return [...names];
}

export function skillContext(
  agentName: string,
  agent: AgentConfig,
  task: string,
): string {
  const selected = selectedSkillNames(agentName, agent, task);
  if (selected.length === 0) return "";

  const byName = new Map(skillCatalog().map((skill) => [skill.name, skill]));
  const selectedMetadata = selected
    .map((name) => byName.get(name))
    .filter((skill): skill is SkillMetadata => Boolean(skill));
  if (selectedMetadata.length === 0) return "";

  const lines: string[] = [
    "# Relevant Loom Skills",
    "Use these project skills as operating guidance when they apply. Their source files are available on disk.",
  ];
  for (const skill of selectedMetadata) {
    lines.push("");
    lines.push(`- ${skill.name}`);
    lines.push(`  path: ${skill.path}`);
    if (skill.description) lines.push(`  description: ${skill.description}`);
    if (skill.whenToUse) {
      lines.push("  when_to_use:");
      for (const line of skill.whenToUse.split(/\r?\n/).slice(0, 5)) {
        if (line.trim()) lines.push(`    ${line.trim()}`);
      }
    }
  }
  return lines.join("\n");
}

export function selectedSkillNames(
  agentName: string,
  agent: AgentConfig,
  task: string,
): string[] {
  const catalog = skillCatalog();
  if (catalog.length === 0) return [];

  const wanted = new Set(relevantSkillNames(agentName, agent, task));
  const selected: string[] = [];
  for (const skill of catalog) {
    if (wanted.has(skill.name)) selected.push(skill.name);
    if (selected.length >= 5) break;
  }
  return selected;
}

function slugifySkill(text: string): string {
  const slug =
    text
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "reflected-procedure";
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `${slug}-${hash.toString(36).slice(0, 6)}`;
}

function skillDraft(name: string, procedure: string, source: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: Candidate skill drafted from Loom reflect phase: ${procedure.slice(0, 96)}`,
    "---",
    "",
    `# ${name}`,
    "",
    "## When To Use",
    "",
    `Use this when a future task matches this reflected procedure from ${source}.`,
    "",
    "## Steps",
    "",
    `- ${procedure}`,
    "",
    "## Verification",
    "",
    "- Confirm the procedure's stated checks pass.",
    "- Inspect the resulting diff or artefact before promoting this skill.",
    "",
    "## Failure Recovery",
    "",
    "- Stop using this candidate if the procedure is ambiguous or causes failures.",
    "- Revise the steps with concrete commands and rerun the relevant tests.",
    "",
  ].join("\n");
}

export function writeSkillCandidate(procedure: string, source: string): string | null {
  const body = procedure.trim();
  if (!body) return null;
  const root = path.join(workspaceRoot(), "skills", "candidates");
  fs.mkdirSync(root, { recursive: true });
  const name = slugifySkill(body);
  const dir = path.join(root, name);
  const filePath = path.join(dir, "SKILL.md");
  if (fs.existsSync(filePath)) return null;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, skillDraft(name, body, source), "utf8");
  return filePath;
}

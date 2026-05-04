import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installedSkills,
  readSkillMetadata,
  relevantSkillNames,
  skillCatalog,
  skillContext,
} from "../../src/agents/skills";
import { AgentConfig } from "../../src/types";

const baseAgent = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  description: "",
  runtime: "codex",
  model: "x",
  ...overrides,
});

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-skills-test-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("installedSkills", () => {
  it("returns at least one entry from the package skills directory", () => {
    const skills = installedSkills();
    // The repo ships with several skills under .agents/skills.
    expect(skills.length).toBeGreaterThan(0);
  });

  it("returns entries sorted by name", () => {
    const names = installedSkills().map((s) => s.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});

describe("readSkillMetadata", () => {
  it("returns null when SKILL.md is missing", () => {
    expect(readSkillMetadata(tmp)).toBeNull();
  });

  it("derives name from the directory basename when no frontmatter", () => {
    const dir = path.join(tmp, "my-skill");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "SKILL.md"), "Just plain content.");
    const md = readSkillMetadata(dir);
    expect(md?.name).toBe("my-skill");
    expect(md?.description).toBe("");
  });

  it("parses the description field from YAML-like frontmatter", () => {
    const dir = path.join(tmp, "skill-a");
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      "---\nname: skill-a\ndescription: \"Does X\"\n---\nbody",
    );
    const md = readSkillMetadata(dir);
    expect(md?.name).toBe("skill-a");
    expect(md?.description).toBe("Does X");
  });

  it("captures the 'When to Use' section (up to 8 lines)", () => {
    const dir = path.join(tmp, "skill-b");
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      [
        "---",
        "description: x",
        "---",
        "## When to Use",
        "- Trigger A",
        "- Trigger B",
        "",
        "## Other",
        "ignored",
      ].join("\n"),
    );
    const md = readSkillMetadata(dir);
    expect(md?.whenToUse).toContain("- Trigger A");
    expect(md?.whenToUse).toContain("- Trigger B");
    expect(md?.whenToUse).not.toContain("ignored");
  });
});

describe("skillCatalog", () => {
  it("includes only skills that have a SKILL.md", () => {
    const catalog = skillCatalog();
    for (const entry of catalog) {
      expect(entry.path.endsWith("SKILL.md")).toBe(true);
    }
  });
});

describe("relevantSkillNames", () => {
  it("returns an empty array when no keyword matches and no agent default", () => {
    expect(
      relevantSkillNames("noname", baseAgent(), "completely unrelated text"),
    ).toEqual([]);
  });

  it("matches planning keywords to planning + context skills", () => {
    const names = relevantSkillNames("anyone", baseAgent(), "Make a plan");
    expect(names).toContain("planning-and-task-breakdown");
    expect(names).toContain("context-engineering");
  });

  it("matches Korean planning keywords (계획)", () => {
    const names = relevantSkillNames("anyone", baseAgent(), "계획을 세워줘");
    expect(names).toContain("planning-and-task-breakdown");
  });

  it("matches review keywords", () => {
    const names = relevantSkillNames("anyone", baseAgent(), "code review");
    expect(names).toContain("code-review-and-quality");
  });

  it("matches test keywords with both TDD and debugging skills", () => {
    const names = relevantSkillNames("anyone", baseAgent(), "test failing");
    expect(names).toContain("test-driven-development");
    expect(names).toContain("debugging-and-error-recovery");
  });

  it("includes agent-default skills for known agents", () => {
    const names = relevantSkillNames("twistedfate", baseAgent(), "anything");
    expect(names).toContain("context-engineering");
    expect(names).toContain("documentation-and-adrs");
  });

  it("deduplicates skills found via multiple paths", () => {
    const names = relevantSkillNames(
      "twistedfate",
      baseAgent(),
      "documentation",
    );
    const docCount = names.filter((n) => n === "documentation-and-adrs").length;
    expect(docCount).toBe(1);
  });
});

describe("skillContext", () => {
  it("returns empty string when no relevant skills are found", () => {
    expect(skillContext("noname", baseAgent(), "totally unrelated")).toBe("");
  });

  it("starts with a 'Relevant Loom Skills' header when matches exist", () => {
    const out = skillContext("anyone", baseAgent(), "test driven");
    if (out !== "") {
      expect(out).toContain("# Relevant Loom Skills");
    }
  });

  it("is capped at 5 selected skills regardless of matches", () => {
    const out = skillContext(
      "twistedfate",
      baseAgent(),
      "plan review test docs security api mcp skill implement",
    );
    if (out !== "") {
      const bullets = out.match(/^\- /gm) ?? [];
      expect(bullets.length).toBeLessThanOrEqual(5);
    }
  });
});

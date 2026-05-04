import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { loadDefaults } from "../../src/config";
import { LOOM_PHASES, LoomPhase } from "../../src/types";
import { loadPhaseMatrix } from "../../src/phases/matrix";
import { getPackageRoot } from "../../src/workspace";

const VALID_PHASES = new Set<string>(LOOM_PHASES);

const defaults = loadDefaults();
const personaNames = Object.keys(defaults.agents);

function readFrontmatter(filePath: string): { [key: string]: string } | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = content.slice(3, end).trim();
  const out: { [key: string]: string } = {};
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    out[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return out;
}

function parsePhasesField(value: string): string[] {
  // Accept `[a, b]` or `a, b` or `[a]`.
  const trimmed = value.trim();
  const inner = trimmed.startsWith("[") && trimmed.endsWith("]")
    ? trimmed.slice(1, -1)
    : trimmed;
  return inner
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("persona phases frontmatter eval (E-4)", () => {
  for (const name of personaNames) {
    describe(`persona ${name}`, () => {
      const agent = defaults.agents[name];
      const promptPath = agent.rolePrompt
        ? path.join(getPackageRoot(), agent.rolePrompt)
        : "";

      it("has a phases: field in frontmatter", () => {
        const fm = readFrontmatter(promptPath);
        expect(fm, `frontmatter missing for ${name}`).toBeTruthy();
        expect(fm).toHaveProperty("phases");
      });

      it("declares only valid LoomPhase values", () => {
        const fm = readFrontmatter(promptPath);
        const phases = parsePhasesField(fm?.phases ?? "");
        expect(phases.length).toBeGreaterThan(0);
        for (const phase of phases) {
          expect(VALID_PHASES.has(phase)).toBe(true);
        }
      });

      it("frontmatter phases align with the matrix coverage", () => {
        // twistedfate is intentionally in every phase via the runner,
        // not the matrix — it doesn't need to appear in phases.md.
        if (name === "twistedfate") return;
        const fm = readFrontmatter(promptPath);
        const declared = new Set(parsePhasesField(fm?.phases ?? ""));
        const matrix = loadPhaseMatrix();
        const matrixPhases = new Set<LoomPhase>();
        for (const rule of matrix) {
          if (rule.primary.includes(name) || rule.secondary.includes(name)) {
            matrixPhases.add(rule.phase);
          }
        }
        for (const phase of matrixPhases) {
          expect(
            declared.has(phase),
            `${name}: phases.md uses ${phase} but rolePrompt frontmatter doesn't list it`,
          ).toBe(true);
        }
      });
    });
  }

  it("_common.md (shared prompt) is intentionally excluded from this check", () => {
    const file = path.join(getPackageRoot(), "harness", "prompts", "_common.md");
    expect(fs.existsSync(file)).toBe(true);
  });
});

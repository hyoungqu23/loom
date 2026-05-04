import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { loadDefaults } from "../../src/config";
import { getPackageRoot } from "../../src/workspace";

const promptsDir = path.join(getPackageRoot(), "harness", "prompts");
const contractsDir = path.join(getPackageRoot(), "harness", "contracts");

const defaults = loadDefaults();

const personaNames = Object.keys(defaults.agents);

describe("persona structure", () => {
  for (const name of personaNames) {
    describe(`persona ${name}`, () => {
      const agent = defaults.agents[name];
      const promptPath = agent.rolePrompt
        ? path.join(getPackageRoot(), agent.rolePrompt)
        : "";

      it("has a rolePrompt declared in defaults.json", () => {
        expect(agent.rolePrompt).toBeTruthy();
      });

      it("has the rolePrompt file present on disk", () => {
        expect(fs.existsSync(promptPath)).toBe(true);
      });

      it("contains a YAML frontmatter block", () => {
        const content = fs.readFileSync(promptPath, "utf8");
        expect(content.startsWith("---")).toBe(true);
        const second = content.indexOf("\n---", 3);
        expect(second).toBeGreaterThan(-1);
      });

      it("frontmatter declares a `name` matching the agent key", () => {
        const content = fs.readFileSync(promptPath, "utf8");
        const match = content.match(/^name:\s*(\S+)/m);
        expect(match?.[1]).toBe(name);
      });

      it("declares all required structural sections", () => {
        const content = fs.readFileSync(promptPath, "utf8");
        for (const section of [
          "## Mission",
          "## Operating Context",
          "## Priorities",
          "## Anti-patterns",
          "## Key Principles",
        ]) {
          expect(content).toContain(section);
        }
      });

      it("contract value points to an existing contract file", () => {
        const contractKey = agent.contract || "default";
        const rel = defaults.outputContract[contractKey];
        expect(rel).toBeTruthy();
        const abs = path.join(getPackageRoot(), rel);
        expect(fs.existsSync(abs)).toBe(true);
      });

      it("rolePrompt body is at least 600 bytes (no more 1-line stubs)", () => {
        const content = fs.readFileSync(promptPath, "utf8");
        expect(content.length).toBeGreaterThanOrEqual(600);
      });
    });
  }
});

describe("contracts coverage", () => {
  for (const [key, rel] of Object.entries(defaults.outputContract)) {
    it(`contract '${key}' file exists`, () => {
      const abs = path.join(getPackageRoot(), rel);
      expect(fs.existsSync(abs)).toBe(true);
    });
  }

  it("every persona's contract is listed in defaults.outputContract", () => {
    for (const [name, agent] of Object.entries(defaults.agents)) {
      const key = agent.contract || "default";
      expect(defaults.outputContract).toHaveProperty(key);
      // Avoid empty test name when failure happens — interpolate name.
      if (!defaults.outputContract[key]) {
        throw new Error(`agent ${name} has unknown contract ${key}`);
      }
    }
  });
});

describe("_common.md is present", () => {
  it("harness/prompts/_common.md exists", () => {
    expect(fs.existsSync(path.join(promptsDir, "_common.md"))).toBe(true);
  });

  it("contains the ${language} placeholder", () => {
    const content = fs.readFileSync(
      path.join(promptsDir, "_common.md"),
      "utf8",
    );
    expect(content).toContain("${language}");
  });

  it("contains the ${agentName} placeholder", () => {
    const content = fs.readFileSync(
      path.join(promptsDir, "_common.md"),
      "utf8",
    );
    expect(content).toContain("${agentName}");
  });
});

describe("contract files have a Confidence section", () => {
  for (const rel of Object.values(defaults.outputContract)) {
    const abs = path.join(contractsDir, path.basename(rel));
    if (!fs.existsSync(abs)) continue;
    it(`${path.basename(rel)} declares 확신도 section`, () => {
      const content = fs.readFileSync(abs, "utf8");
      expect(content).toContain("## 확신도");
    });
  }
});

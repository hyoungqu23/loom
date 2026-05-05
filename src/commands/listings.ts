import { loadDefaults } from "../config.js";
import { installedSkills } from "../agents/skills.js";
import { summarizeSkillReview } from "../metrics/events.js";

export function printAgents(): void {
  const defaults = loadDefaults();
  console.log("Agent Registry\n");
  for (const [name, agent] of Object.entries(defaults.agents)) {
    const model = agent.effort ? `${agent.model}/${agent.effort}` : agent.model;
    console.log(
      `${name.padEnd(12)} ${agent.runtime.padEnd(7)} ${model.padEnd(20)} ${agent.description}`,
    );
  }
}

export function printInstalledSkills(): void {
  const skills = installedSkills();
  console.log("Skills\n");
  if (skills.length === 0) {
    console.log("(none installed)");
    return;
  }
  for (const skill of skills) {
    console.log(`${skill.name.padEnd(34)} ${skill.path}`);
  }
}

export function runSkillsCommand(positionals: string[] = []): void {
  const subcommand = positionals[0] || "list";
  if (subcommand === "list") {
    printInstalledSkills();
    return;
  }
  if (subcommand === "review") {
    const rows = summarizeSkillReview();
    console.log("Skills Review\n");
    if (rows.length === 0) {
      console.log("(no failed skill usage recorded)");
      return;
    }
    for (const row of rows) {
      console.log(
        `${row.skill} failures=${row.failures} features=${row.features.join(",")}`,
      );
    }
    return;
  }
  throw new Error("Usage: loom skills [list|review]");
}

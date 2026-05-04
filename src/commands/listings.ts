import { loadDefaults } from "../config";
import { installedSkills } from "../agents/skills";

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

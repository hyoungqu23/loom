import { AgentConfig } from "../types.js";
import { loadDefaults } from "../config.js";

export function loadAgent(agentName: string): AgentConfig {
  const defaults = loadDefaults();
  const agent = defaults.agents[agentName];
  if (!agent) {
    throw new Error(`Unknown agent: ${agentName}`);
  }
  return agent;
}

export function listAgentNames(): string[] {
  return Object.keys(loadDefaults().agents);
}

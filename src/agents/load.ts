import { AgentConfig } from "../types";
import { loadDefaults } from "../config";

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

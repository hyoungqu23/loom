import * as path from "path";
import { Flags } from "./types";
import { setActiveWorkspace } from "./workspace";
import { parseArgs, flagBool, flagString } from "./util/parse-args";
import { initWorkspace } from "./commands/init";
import { runConfigCommand } from "./commands/config";
import { runDoctor } from "./commands/doctor";
import { runPhaseCommand } from "./commands/phase";
import { runAutopilot } from "./commands/autopilot";
import { printAgents, printInstalledSkills } from "./commands/listings";
import { printHelp } from "./commands/help";
import { runMemoryCommand } from "./commands/memory";
import { runMetricsCommand } from "./commands/metrics";
import { runRuntime } from "./engine";
import { buildRuntimeCommand } from "./runtimes";

type Handler = (positionals: string[], flags: Flags) => Promise<void> | void;

const HANDLERS: { [key: string]: Handler } = {
  init: (_pos, flags) => {
    initWorkspace(flags);
  },
  config: (positionals, flags) => {
    runConfigCommand(positionals.slice(1), flags);
  },
  doctor: async (_pos, flags) => {
    await runDoctor(flags);
  },
  agents: () => {
    printAgents();
  },
  phase: async (positionals, flags) => {
    await runPhaseCommand(positionals.slice(1), flags);
  },
  autopilot: async (positionals, flags) => {
    await runAutopilot(positionals.slice(1), flags);
  },
  skills: () => {
    printInstalledSkills();
  },
  memory: (positionals, flags) => {
    runMemoryCommand(positionals.slice(1), flags);
  },
  metrics: (positionals, flags) => {
    runMetricsCommand(positionals.slice(1), flags);
  },
};

export async function main(argv: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals[0];

  const cwdFlag = flagString(flags.cwd);
  if (cwdFlag) {
    setActiveWorkspace(path.resolve(cwdFlag));
  }

  if (!command || command === "help" || flagBool(flags.help)) {
    printHelp();
    return;
  }

  const handler = HANDLERS[command];
  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }
  await handler(positionals, flags);
}

export { buildRuntimeCommand };
export { runRuntime };

module.exports = {
  main,
  buildRuntimeCommand,
  runRuntime,
};

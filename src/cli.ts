import * as path from "path";
import { Flags } from "./types";
import { setActiveWorkspace } from "./workspace";
import { parseArgs, flagBool, flagString } from "./util/parse-args";
import { initWorkspace } from "./commands/init";
import { runConfigCommand } from "./commands/config";
import { runDoctor } from "./commands/doctor";
import { runPhaseCommand } from "./commands/phase";
import { runAutopilot } from "./commands/autopilot";
import { printAgents, runSkillsCommand } from "./commands/listings";
import { printHelp } from "./commands/help";
import { runMemoryCommand } from "./commands/memory";
import { runMetricsCommand } from "./commands/metrics";
import { runExportCommand } from "./commands/export";
import { runCronCommand } from "./commands/cron";
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
  skills: (positionals) => {
    runSkillsCommand(positionals.slice(1));
  },
  memory: (positionals, flags) => {
    runMemoryCommand(positionals.slice(1), flags);
  },
  metrics: (positionals, flags) => {
    runMetricsCommand(positionals.slice(1), flags);
  },
  export: (positionals, flags) => {
    runExportCommand(positionals.slice(1), flags);
  },
  cron: async (positionals, flags) => {
    await runCronCommand(positionals.slice(1), flags);
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

export type CliCommandResult = {
  status: "ok" | "error";
  stdout: string;
  stderr: string;
};

let cliCommandQueue: Promise<void> = Promise.resolve();

async function runCliCommandIsolated(argv: string[]): Promise<CliCommandResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  };
  try {
    await main(argv);
    return {
      status: "ok",
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.push(message);
    return {
      status: "error",
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

export async function runCliCommand(argv: string[]): Promise<CliCommandResult> {
  const previous = cliCommandQueue;
  let release!: () => void;
  cliCommandQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await runCliCommandIsolated(argv);
  } finally {
    release();
  }
}

export { buildRuntimeCommand };
export { runRuntime };

module.exports = {
  main,
  runCliCommand,
  buildRuntimeCommand,
  runRuntime,
};

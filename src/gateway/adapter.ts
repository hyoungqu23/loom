import { runCliCommand } from "../cli";

export type GatewayInput = {
  text: string;
  sender: string;
  channel: string;
  threadId: string;
  attachments: Array<{ name: string; path?: string; url?: string }>;
};

export type GatewayOutput = {
  text: string;
  files: string[];
  status: "ok" | "error" | "ignored";
  nextAction: "none" | "needs-human";
};

function splitCommand(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed.match(/"([^"]*)"|'([^']*)'|\S+/g) || [];
  return parts.map((part) => part.replace(/^["']|["']$/g, ""));
}

function isGatewayAllowed(argv: string[]): boolean {
  const [command, subcommand] = argv;
  if (!command || command === "help") return true;
  if (command === "agents" || command === "skills") return subcommand !== "review";
  if (command === "memory") return subcommand === "list" || subcommand === "search";
  if (command === "metrics") return subcommand === "summary" || !subcommand;
  if (command === "export") return subcommand === "trajectory";
  if (command === "cron") return subcommand === "list" || !subcommand;
  if (command === "config") return subcommand === "show" || subcommand === "path";
  return false;
}

export async function handleGatewayMessage(
  input: GatewayInput,
): Promise<GatewayOutput> {
  const argv = splitCommand(input.text);
  if (argv[0] !== "loom") {
    return { text: "", files: [], status: "ignored", nextAction: "none" };
  }

  const commandArgv = argv.slice(1);
  if (!isGatewayAllowed(commandArgv)) {
    return {
      text: `command not allowed from gateway: ${commandArgv.join(" ")}`,
      files: [],
      status: "error",
      nextAction: "needs-human",
    };
  }

  const result = await runCliCommand(commandArgv);
  if (result.status === "ok") {
    return {
      text: result.stdout,
      files: [],
      status: "ok",
      nextAction: "none",
    };
  }
  return {
    text: result.stderr || result.stdout,
    files: [],
    status: "error",
    nextAction: "needs-human",
  };
}

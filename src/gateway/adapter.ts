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

export async function handleGatewayMessage(
  input: GatewayInput,
): Promise<GatewayOutput> {
  const argv = splitCommand(input.text);
  if (argv[0] !== "loom") {
    return { text: "", files: [], status: "ignored", nextAction: "none" };
  }

  const result = await runCliCommand(argv.slice(1));
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

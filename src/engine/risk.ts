export type CommandRiskCategory =
  | "destructive"
  | "filesystem-write"
  | "git-history"
  | "network"
  | "secret-access";

export type CommandRiskLevel = "safe" | "low" | "medium" | "high";

export type CommandRiskInput = {
  command: string;
  args?: string[];
};

export type CommandRisk = {
  level: CommandRiskLevel;
  categories: CommandRiskCategory[];
  reason: string;
};

const SAFE_COMMANDS = new Set([
  "cat",
  "date",
  "find",
  "git",
  "ls",
  "pwd",
  "rg",
  "sed",
  "true",
  "wc",
]);

const NETWORK_COMMANDS = new Set([
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "npm",
  "pnpm",
  "yarn",
  "uv",
  "pip",
  "pip3",
]);

const WRITE_COMMANDS = new Set([
  "cp",
  "install",
  "mkdir",
  "mv",
  "npm",
  "pnpm",
  "touch",
  "yarn",
]);

const DESTRUCTIVE_COMMANDS = new Set(["rm", "rmdir", "truncate"]);

function basename(command: string): string {
  return command.split(/[\\/]/).pop() || command;
}

function add<T>(set: Set<T>, value: T, condition: boolean): void {
  if (condition) set.add(value);
}

function includesAny(args: string[], needles: string[]): boolean {
  return args.some((arg) => needles.some((needle) => arg.includes(needle)));
}

function looksLikeSecretAccess(args: string[]): boolean {
  return args.some((arg) => {
    const lower = arg.toLowerCase();
    return (
      lower === ".env" ||
      lower.endsWith("/.env") ||
      lower.includes(".env.") ||
      lower.includes("secret") ||
      lower.includes("secrets") ||
      lower.includes("token") ||
      lower.includes("credential")
    );
  });
}

function classifyGit(args: string[], categories: Set<CommandRiskCategory>): void {
  const subcommand = args[0] || "";
  add(categories, "filesystem-write", ["add", "commit", "merge", "rebase"].includes(subcommand));
  add(categories, "git-history", ["rebase", "reset", "push"].includes(subcommand));
  add(
    categories,
    "destructive",
    (subcommand === "reset" && args.includes("--hard")) ||
      (subcommand === "push" && includesAny(args, ["--force", "-f"])) ||
      subcommand === "clean",
  );
}

function riskLevel(categories: Set<CommandRiskCategory>, command: string): CommandRiskLevel {
  if (
    categories.has("destructive") ||
    categories.has("git-history") ||
    categories.has("secret-access")
  ) {
    return "high";
  }
  if (categories.has("network")) return "medium";
  if (categories.has("filesystem-write")) return "medium";
  if (SAFE_COMMANDS.has(command)) return "safe";
  return "low";
}

export function classifyCommandRisk(input: CommandRiskInput): CommandRisk {
  const command = basename(input.command);
  const args = input.args || [];
  const categories = new Set<CommandRiskCategory>();

  add(categories, "destructive", DESTRUCTIVE_COMMANDS.has(command));
  add(categories, "filesystem-write", DESTRUCTIVE_COMMANDS.has(command));
  add(categories, "filesystem-write", WRITE_COMMANDS.has(command));
  add(categories, "network", NETWORK_COMMANDS.has(command));
  add(categories, "secret-access", looksLikeSecretAccess(args));

  if (command === "git") classifyGit(args, categories);

  const level = riskLevel(categories, command);
  const list = Array.from(categories).sort();
  return {
    level,
    categories: list,
    reason: list.length === 0 ? "no risky command pattern matched" : list.join(", "),
  };
}

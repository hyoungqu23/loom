import { spawnSync } from "child_process";
import { CommandCheck } from "../types";

const COMMAND_CHECK_CACHE = new Map<string, CommandCheck>();

export function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function commandExists(command: string): CommandCheck {
  const cached = COMMAND_CHECK_CACHE.get(command);
  if (cached) return cached;

  const result = spawnSync(
    "zsh",
    ["-lc", `command -v ${shellQuote(command)}`],
    { encoding: "utf8" },
  );
  const check: CommandCheck = {
    ok: result.status === 0,
    path: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
  COMMAND_CHECK_CACHE.set(command, check);
  return check;
}

export function clearCommandCheckCache(): void {
  COMMAND_CHECK_CACHE.clear();
}

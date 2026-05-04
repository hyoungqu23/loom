import * as fs from "fs";
import * as path from "path";
import { CommandCheck } from "../types";

const COMMAND_CHECK_CACHE = new Map<string, CommandCheck>();

/**
 * Cross-platform `which`. We walk `PATH` directly instead of shelling out
 * so Linux hosts (no zsh) and CI environments work without a login shell.
 * The lookup honors PATHEXT on Windows and the executable bit on POSIX.
 */
function lookupOnPath(command: string): string {
  if (!command) return "";
  const PATH = process.env.PATH || "";
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return resolvableExecutable(command) ? path.resolve(command) : "";
  }
  if (!PATH) return "";
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
  for (const dir of PATH.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      if (resolvableExecutable(candidate)) return candidate;
    }
  }
  return "";
}

function resolvableExecutable(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return false;
    if (process.platform !== "win32") {
      fs.accessSync(candidate, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

export function commandExists(command: string): CommandCheck {
  const cached = COMMAND_CHECK_CACHE.get(command);
  if (cached) return cached;

  const found = lookupOnPath(command);
  const check: CommandCheck = {
    ok: Boolean(found),
    path: found,
    stderr: "",
  };
  COMMAND_CHECK_CACHE.set(command, check);
  return check;
}

export function clearCommandCheckCache(): void {
  COMMAND_CHECK_CACHE.clear();
}

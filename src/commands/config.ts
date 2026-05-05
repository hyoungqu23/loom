import * as fs from "fs";
import { Flags } from "../types.js";
import {
  loadDefaults,
  loadWorkspaceConfig,
  saveWorkspaceConfig,
} from "../config.js";
import {
  ensureWorkspaceState,
  workspaceConfigPath,
} from "../workspace.js";
import {
  getNestedValue,
  normalizeConfigPath,
  parseConfigValue,
  setNestedValue,
  JsonObject,
} from "../util/values.js";
import { flagBool } from "../util/parse-args.js";

function printConfigHelp(): void {
  console.log(`loom config

Usage:
  loom config show [path]
  loom config path
  loom config set <path> <value>

Examples:
  loom config show agents.kayle
  loom config set agents.kayle.model opus
  loom config set runtimes.gemini.model gemini-2.5-pro
`);
}

export function runConfigCommand(args: string[], flags: Flags): void {
  const subcommand = args[0] || "show";

  if (subcommand === "help" || flagBool(flags.help)) {
    printConfigHelp();
    return;
  }

  if (subcommand === "path") {
    ensureWorkspaceState();
    console.log(workspaceConfigPath());
    return;
  }

  if (subcommand === "show") {
    const merged = loadDefaults();
    const baseObject: JsonObject = JSON.parse(JSON.stringify(merged));
    const value = getNestedValue(baseObject, normalizeConfigPath(args[1] || ""));
    if (value === undefined) {
      throw new Error(`Config path not found: ${args[1]}`);
    }
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (subcommand === "set") {
    const key = args[1];
    const rawValue = args.slice(2).join(" ");
    if (!key || rawValue.length === 0) {
      throw new Error("Usage: loom config set <path> <value>");
    }
    const current: JsonObject = fs.existsSync(workspaceConfigPath())
      ? loadWorkspaceConfig()
      : {};
    const value = parseConfigValue(rawValue);
    setNestedValue(current, normalizeConfigPath(key), value);
    saveWorkspaceConfig(current);
    console.log(
      `[loom] set ${normalizeConfigPath(key)} = ${JSON.stringify(value)}`,
    );
    console.log(`[loom] config: ${workspaceConfigPath()}`);
    return;
  }

  throw new Error(`Unknown config command: ${subcommand}`);
}

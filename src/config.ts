import * as fs from "fs";
import { Defaults } from "./types";
import {
  defaultsPath,
  ensureWorkspaceState,
  workspaceConfigPath,
} from "./workspace";
import { writeJson } from "./util/json";
import { deepMerge, JsonObject } from "./util/values";

let cachedDefaults: Defaults | null = null;

/** Load and cache the package-level defaults.json. */
function loadPackageDefaults(): Defaults {
  if (cachedDefaults) return cachedDefaults;
  const content = fs.readFileSync(defaultsPath(), "utf8");
  const parsed: Defaults = JSON.parse(content);
  cachedDefaults = parsed;
  return parsed;
}

/** Return defaults merged with the workspace-local config.json (if present). */
export function loadDefaults(): Defaults {
  const pkg = loadPackageDefaults();
  const configPath = workspaceConfigPath();
  if (!fs.existsSync(configPath)) {
    // Return a deep clone so callers can't mutate the cached package defaults.
    return JSON.parse(JSON.stringify(pkg));
  }
  const localContent = fs.readFileSync(configPath, "utf8");
  const local: JsonObject = JSON.parse(localContent);
  const base: JsonObject = JSON.parse(JSON.stringify(pkg));
  const merged: JsonObject = deepMerge(base, local);
  // Re-parse through JSON to get the concrete domain shape without using
  // a type assertion. JSON.parse returns `any`, which is assignable to
  // `Defaults` under strict mode.
  const result: Defaults = JSON.parse(JSON.stringify(merged));
  return result;
}

/** Read only the workspace-local overrides. Empty object when absent. */
export function loadWorkspaceConfig(): JsonObject {
  const configPath = workspaceConfigPath();
  if (!fs.existsSync(configPath)) return {};
  const content = fs.readFileSync(configPath, "utf8");
  const parsed: JsonObject = JSON.parse(content);
  return parsed;
}

export function saveWorkspaceConfig(config: JsonObject): void {
  ensureWorkspaceState();
  writeJson(workspaceConfigPath(), config);
}

/** For tests / hot-reload scenarios. */
export function clearDefaultsCache(): void {
  cachedDefaults = null;
}

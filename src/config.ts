import * as fs from "fs";
import { Defaults } from "./types.js";
import {
  defaultsPath,
  ensureWorkspaceState,
  workspaceConfigPath,
} from "./workspace.js";
import { writeJson } from "./util/json.js";
import { deepMerge, JsonObject } from "./util/values.js";

let cachedDefaults: Defaults | null = null;

type WorkspaceCache = {
  path: string;
  mtimeMs: number;
  size: number;
  /** Serialized merged result; deep-cloned per call so callers can mutate. */
  json: string;
};

let workspaceCache: WorkspaceCache | null = null;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

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
    workspaceCache = null;
    return cloneJson(pkg);
  }

  // Cache hit: same path + matching (mtime, size) means the file hasn't
  // changed since we last merged. Skip the re-read + deep-merge + double
  // JSON round-trip, which is non-trivial on hot paths like phase fanout
  // where every worker resolution calls loadDefaults at least twice.
  const stat = fs.statSync(configPath);
  if (
    workspaceCache &&
    workspaceCache.path === configPath &&
    workspaceCache.mtimeMs === stat.mtimeMs &&
    workspaceCache.size === stat.size
  ) {
    return JSON.parse(workspaceCache.json);
  }

  const localContent = fs.readFileSync(configPath, "utf8");
  const local: JsonObject = JSON.parse(localContent);
  const base: JsonObject = cloneJson(pkg);
  const merged: JsonObject = deepMerge(base, local);
  const json = JSON.stringify(merged);
  workspaceCache = {
    path: configPath,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    json,
  };
  const result: Defaults = JSON.parse(json);
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
  // Invalidate eagerly so the next loadDefaults() reflects this write
  // even on filesystems with coarse mtime resolution.
  workspaceCache = null;
}

/** For tests / hot-reload scenarios. */
export function clearDefaultsCache(): void {
  cachedDefaults = null;
  workspaceCache = null;
}

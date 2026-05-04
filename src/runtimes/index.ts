import * as path from "path";
import { spawnSync } from "child_process";
import { RunOptions, RuntimeName, RuntimeSpec, RuntimeVersionInfo } from "../types";
import { loadDefaults } from "../config";
import { workspaceRoot } from "../workspace";
import { RuntimeAdapter } from "./adapter";
import { codexAdapter } from "./codex";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { ollamaAdapter } from "./ollama";

const ADAPTERS: { [key: string]: RuntimeAdapter } = {
  codex: codexAdapter,
  claude: claudeAdapter,
  gemini: geminiAdapter,
  ollama: ollamaAdapter,
};

export function getRuntimeAdapter(runtime: RuntimeName): RuntimeAdapter {
  const adapter = ADAPTERS[runtime];
  if (!adapter) {
    throw new Error(`Unknown runtime: ${runtime}`);
  }
  return adapter;
}

export function listRuntimeNames(): string[] {
  return Object.keys(ADAPTERS);
}

export function buildRuntimeCommand(
  runtime: RuntimeName,
  prompt: string,
  options: RunOptions,
): RuntimeSpec {
  const defaults = loadDefaults();
  const config = defaults.runtimes[runtime];
  if (!config) {
    throw new Error(`Unknown runtime: ${runtime}`);
  }
  const cwd = path.resolve(options.cwd || workspaceRoot());
  const model = options.model || config.model;
  const adapter = getRuntimeAdapter(runtime);
  return adapter.buildSpec({ prompt, cwd, model, config, options });
}

export function runtimeVersion(
  runtime: RuntimeName,
  command: string,
): RuntimeVersionInfo {
  const adapter = ADAPTERS[runtime];
  const args = adapter ? adapter.versionArgs : ["--version"];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 15_000,
  });
  return {
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

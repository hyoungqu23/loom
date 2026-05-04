import * as fs from "fs";
import * as path from "path";
import { RunOptions, RuntimeName, RuntimeResult } from "../types";
import { ensureWorkspaceState } from "../workspace";
import { writeJson } from "../util/json";
import { buildRuntimeCommand } from "../runtimes";
import { DEFAULT_RUNTIME_TIMEOUT_MS } from "./constants";
import { runSpec } from "./spawn";

function runtimeRunDir(runtime: RuntimeName): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(
    ensureWorkspaceState(),
    "runtime-runs",
    `${stamp}-${runtime}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export type RuntimeRun = {
  dir: string;
  result: RuntimeResult;
};

function buildRequest(runtime: RuntimeName, prompt: string, options: RunOptions) {
  const spec = buildRuntimeCommand(runtime, prompt, options);
  return {
    runtime,
    prompt,
    command: spec.command,
    args: spec.args,
    cwd: spec.cwd,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Spawn a single LLM CLI invocation asynchronously and persist artifacts to a
 * fresh session directory.
 */
export async function runRuntime(
  runtime: RuntimeName,
  prompt: string,
  options: RunOptions,
): Promise<RuntimeRun> {
  const spec = buildRuntimeCommand(runtime, prompt, options);
  const dir = runtimeRunDir(runtime);
  writeJson(path.join(dir, "request.json"), buildRequest(runtime, prompt, options));

  const timeoutMs = options.timeoutMs ?? DEFAULT_RUNTIME_TIMEOUT_MS;
  const result = await runSpec(spec, timeoutMs);

  fs.writeFileSync(path.join(dir, "stdout.md"), result.stdout);
  fs.writeFileSync(path.join(dir, "stderr.log"), result.stderr);
  writeJson(path.join(dir, "result.json"), {
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error) : null,
    finishedAt: new Date().toISOString(),
  });

  return { dir, result };
}

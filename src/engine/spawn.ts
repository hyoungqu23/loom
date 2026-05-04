import { spawn } from "child_process";
import { RuntimeResult, RuntimeSpec, WorkerStream } from "../types";
import { KILL_GRACE_MS } from "./constants";

export type SpawnHooks = {
  /** Streaming callback for stdout/stderr chunks (decoded as utf8). */
  onData?: (stream: WorkerStream, text: string) => void;
};

/**
 * Spawn `spec` and resolve with the captured result. The Node event loop stays
 * responsive (no spawnSync) and a hard timeout enforces an upper bound.
 *
 * SIGTERM is sent at `timeoutMs`; SIGKILL is sent `KILL_GRACE_MS` later if the
 * child is still alive.
 */
export function runSpec(
  spec: RuntimeSpec,
  timeoutMs: number,
  hooks: SpawnHooks = {},
): Promise<RuntimeResult> {
  return new Promise<RuntimeResult>((resolve) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (spec.stdin) {
      child.stdin.end(spec.stdin);
    } else {
      child.stdin.end();
    }

    let stdout = "";
    let stderr = "";
    let runError: Error | null = null;

    const timeout = setTimeout(() => {
      const text = `\n[loom] runtime timed out after ${timeoutMs}ms\n`;
      stderr += text;
      if (hooks.onData) hooks.onData("stderr", text);
      child.kill("SIGTERM");
      const grace = setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, KILL_GRACE_MS);
      grace.unref();
    }, timeoutMs);
    timeout.unref();

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (hooks.onData) hooks.onData("stdout", text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (hooks.onData) hooks.onData("stderr", text);
    });
    child.on("error", (error: Error) => {
      runError = error;
      const text = `${error.stack || error.message || String(error)}\n`;
      stderr += text;
      if (hooks.onData) hooks.onData("stderr", text);
    });
    child.on("close", (status: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timeout);
      resolve({ status, signal, stdout, stderr, error: runError });
    });
  });
}

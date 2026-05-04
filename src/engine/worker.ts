import * as fs from "fs";
import * as path from "path";
import {
  AgentRun,
  Flags,
  RunOptions,
  TeamHooks,
  WorkerResult,
} from "../types";
import { loadAgent } from "../agents/load";
import { withRolePrompt, WithRolePromptOptions } from "../agents/prompt";
import { selectedSkillNames } from "../agents/skills";
import { buildRuntimeCommand } from "../runtimes";
import { writeJson } from "../util/json";
import { flagNumber, flagString } from "../util/parse-args";
import { DEFAULT_RUNTIME_TIMEOUT_MS } from "./constants";
import { runSpec } from "./spawn";
import { classifyCommandRisk } from "./risk";

/**
 * Resolve a run plan for one agent (prompt + spawn spec).
 *
 * `promptOptions` lets the caller (e.g. phase runner) attach phase
 * context or a handoff bundle that gets rendered into the system
 * prompt. Defaults to standalone (no phase) for backwards compat.
 */
export function resolveAgentRun(
  agentName: string,
  task: string,
  flags: Flags,
  promptOptions: WithRolePromptOptions = {},
): AgentRun {
  const agent = loadAgent(agentName);
  const prompt = withRolePrompt(task, agent, agentName, promptOptions);
  const relevantSkills = selectedSkillNames(agentName, agent, task);
  const options: RunOptions = {
    cwd: flagString(flags.cwd) || undefined,
    model: flagString(flags.model) || agent.model,
    effort: flagString(flags.effort) || agent.effort,
    agent: agentName,
    sandbox: flagString(flags.sandbox) || undefined,
    permissionMode: flagString(flags["permission-mode"]) || undefined,
    approvalMode: flagString(flags["approval-mode"]) || undefined,
    outputFormat: flagString(flags["output-format"]) || undefined,
    timeoutMs: flagNumber(flags.timeout, 0) || flagNumber(flags.timeoutMs, 0) || undefined,
  };
  const spec = buildRuntimeCommand(agent.runtime, prompt, options);
  return { agentName, agent, prompt, relevantSkills, options, spec };
}

export async function runWorkerAsync(
  worker: AgentRun,
  outputDir: string,
  hooks: TeamHooks = {},
): Promise<WorkerResult> {
  fs.mkdirSync(outputDir, { recursive: true });
  const commandRisk = classifyCommandRisk({
    command: worker.spec.command,
    args: worker.spec.args,
  });
  writeJson(path.join(outputDir, "request.json"), {
    agent: worker.agentName,
    runtime: worker.agent.runtime,
    model: worker.options.model,
    effort: worker.options.effort || null,
    command: worker.spec.command,
    args: worker.spec.args,
    commandRisk,
    relevantSkills: worker.relevantSkills || [],
    stdinPreview: worker.spec.stdin ? worker.spec.stdin.slice(0, 1200) : null,
    cwd: worker.spec.cwd,
    startedAt: new Date().toISOString(),
  });

  const approved = worker.options.approvalMode === "allow-risky";
  if (commandRisk.level === "high" && !approved) {
    const stderr = `[loom] blocked by approval policy: ${commandRisk.reason}\n`;
    fs.writeFileSync(path.join(outputDir, "stdout.md"), "");
    fs.writeFileSync(path.join(outputDir, "stderr.log"), stderr);
    writeJson(path.join(outputDir, "result.json"), {
      status: 1,
      signal: null,
      denied: true,
      commandRisk,
      finishedAt: new Date().toISOString(),
    });
    const result: WorkerResult = {
      ...worker,
      outputDir,
      stdout: "",
      stderr,
      status: 1,
      signal: null,
    };
    if (hooks.onWorkerDone) hooks.onWorkerDone(result);
    return result;
  }

  if (hooks.onWorkerStart) hooks.onWorkerStart(worker, outputDir);

  const timeoutMs = worker.options.timeoutMs ?? DEFAULT_RUNTIME_TIMEOUT_MS;
  const runResult = await runSpec(worker.spec, timeoutMs, {
    onData: hooks.onWorkerData
      ? (stream, text) => hooks.onWorkerData?.(worker, stream, text)
      : undefined,
  });

  fs.writeFileSync(path.join(outputDir, "stdout.md"), runResult.stdout);
  fs.writeFileSync(path.join(outputDir, "stderr.log"), runResult.stderr);
  writeJson(path.join(outputDir, "result.json"), {
    status: runResult.status,
    signal: runResult.signal,
    denied: false,
    commandRisk,
    finishedAt: new Date().toISOString(),
  });

  const result: WorkerResult = {
    ...worker,
    outputDir,
    stdout: runResult.stdout,
    stderr: runResult.stderr,
    status: runResult.status,
    signal: runResult.signal,
  };
  if (hooks.onWorkerDone) hooks.onWorkerDone(result);
  return result;
}

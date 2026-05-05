#!/usr/bin/env node
/**
 * Loom 페르소나 비결정적 평가 러너.
 *
 * 사용:
 *   tsx eval/run-personas.ts                       # 각 페르소나의 기본 런타임 사용
 *   tsx eval/run-personas.ts --runtime claude      # 모든 케이스를 claude로 강제
 *   tsx eval/run-personas.ts --case kayle-finds-sql-injection  # 단일 케이스
 *
 * 결과는 JSON 한 줄씩 stdout에 stream 출력. summary는 마지막 한 줄.
 *
 * 주의:
 *   - 실제 LLM을 호출하므로 비용 발생.
 *   - 비결정적이라 npm test에 포함되지 않는다.
 *   - eval 케이스의 anchor 매칭 비율로 점수 산출.
 */
import * as fs from "fs";
import * as path from "path";
import { loadDefaults } from "../src/config.js";
import { loadAgent } from "../src/agents/load.js";
import { withRolePrompt } from "../src/agents/prompt.js";
import { runRuntime } from "../src/engine.js";
import { parseArgs } from "../src/util/parse-args.js";
import { workspaceRoot } from "../src/workspace.js";

type PersonaCase = {
  id: string;
  agent: string;
  task: string;
  expectedAnchors: string[];
  antiAnchors?: string[];
};

type CaseFile = { cases: PersonaCase[] };

async function runPersonaCase(
  agentName: string,
  task: string,
  runtimeOverride: string | null,
): Promise<string> {
  const agent = loadAgent(agentName);
  const runtime = runtimeOverride || agent.runtime;
  const prompt = withRolePrompt(task, agent, agentName);
  const { result } = await runRuntime(runtime, prompt, {
    cwd: workspaceRoot(),
    model: agent.model,
    effort: agent.effort,
    agent: agentName,
  });
  return result.stdout;
}

function scoreCase(
  output: string,
  expected: string[],
  anti: string[] | undefined,
): { hits: number; misses: string[]; antiHits: string[] } {
  const lower = output.toLowerCase();
  const misses: string[] = [];
  let hits = 0;
  for (const a of expected) {
    if (lower.includes(a.toLowerCase())) hits += 1;
    else misses.push(a);
  }
  const antiHits: string[] = [];
  for (const a of anti || []) {
    if (lower.includes(a.toLowerCase())) antiHits.push(a);
  }
  return { hits, misses, antiHits };
}

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const runtimeOverride =
    typeof flags.runtime === "string" ? flags.runtime : null;
  const onlyCase = typeof flags.case === "string" ? flags.case : null;

  const casesPath = path.join(__dirname, "personas", "cases.json");
  const data: CaseFile = JSON.parse(fs.readFileSync(casesPath, "utf8"));
  const defaults = loadDefaults();

  const results: Array<{
    id: string;
    agent: string;
    score: number;
    missing: string[];
    antiHits: string[];
  }> = [];

  for (const c of data.cases) {
    if (onlyCase && c.id !== onlyCase) continue;
    if (!defaults.agents[c.agent]) {
      process.stderr.write(`SKIP ${c.id}: agent ${c.agent} not configured\n`);
      continue;
    }
    process.stderr.write(`[run] ${c.id} agent=${c.agent}\n`);
    let output = "";
    try {
      output = await runPersonaCase(c.agent, c.task, runtimeOverride);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`FAIL ${c.id}: ${message}\n`);
      continue;
    }
    const { hits, misses, antiHits } = scoreCase(
      output,
      c.expectedAnchors,
      c.antiAnchors,
    );
    const score = c.expectedAnchors.length
      ? hits / c.expectedAnchors.length
      : 1;
    const entry = {
      id: c.id,
      agent: c.agent,
      score,
      missing: misses,
      antiHits,
    };
    results.push(entry);
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }

  const avg =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;
  const summary = {
    summary: true,
    total: results.length,
    avgScore: Number(avg.toFixed(3)),
    failures: results.filter((r) => r.score < 0.5).map((r) => r.id),
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

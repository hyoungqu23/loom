#!/usr/bin/env node
/**
 * Loom 페르소나 비결정적 평가 러너.
 *
 * 사용:
 *   tsx eval/run-personas.ts                       # codex 런타임 사용
 *   tsx eval/run-personas.ts --runtime claude     # claude 사용
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
import { runAsk } from "../src/commands/ask";
import { parseArgs } from "../src/util/parse-args";
import { loadDefaults } from "../src/config";

type PersonaCase = {
  id: string;
  agent: string;
  task: string;
  expectedAnchors: string[];
  antiAnchors?: string[];
};

type CaseFile = { cases: PersonaCase[] };

async function captureAskOutput(
  agent: string,
  task: string,
  runtime: string,
): Promise<string> {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...parts: unknown[]) => {
    lines.push(parts.map((p) => String(p)).join(" "));
  };
  console.error = () => {};
  try {
    await runAsk(["ask", agent, task], { runtime });
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return lines.join("\n");
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
  const runtime = typeof flags.runtime === "string" ? flags.runtime : "codex";
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
      console.error(`SKIP ${c.id}: agent ${c.agent} not configured`);
      continue;
    }
    process.stderr.write(`[run] ${c.id} agent=${c.agent}\n`);
    let output = "";
    try {
      output = await captureAskOutput(c.agent, c.task, runtime);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FAIL ${c.id}: ${message}`);
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
  console.error(message);
  process.exit(1);
});

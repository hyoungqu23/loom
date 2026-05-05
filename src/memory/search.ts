import * as fs from "fs";
import * as path from "path";
import { listPhaseSessions, loadContext, loadPlan } from "../phases/session.js";

export type SessionSearchResult = {
  feature: string;
  path: string;
  score: number;
  summary: string;
};

const SEARCH_FILES = ["STATE.md", "CONTEXT.md", "PLAN.md"];

function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function readMarkdownFiles(dir: string): string {
  const parts: string[] = [];
  for (const file of SEARCH_FILES) {
    const filePath = path.join(dir, file);
    if (fs.existsSync(filePath)) parts.push(fs.readFileSync(filePath, "utf8"));
  }
  const workersDir = path.join(dir, "workers");
  if (fs.existsSync(workersDir)) {
    for (const phase of fs.readdirSync(workersDir).sort()) {
      const phaseDir = path.join(workersDir, phase);
      if (!fs.statSync(phaseDir).isDirectory()) continue;
      for (const file of fs.readdirSync(phaseDir).sort()) {
        if (!file.endsWith(".md")) continue;
        parts.push(fs.readFileSync(path.join(phaseDir, file), "utf8"));
      }
    }
  }
  return parts.join("\n\n");
}

function scoreText(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const matches = lower.split(term).length - 1;
    score += matches;
  }
  return score;
}

function summarizeSession(dir: string, text: string, terms: string[]): string {
  const ctx = loadContext(dir);
  if (ctx?.problem) return ctx.problem;
  const plan = loadPlan(dir);
  if (plan?.approach) return plan.approach;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("---"));
  const lowerTerms = new Set(terms);
  const matching = lines.find((line) =>
    line
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/)
      .some((token) => lowerTerms.has(token)),
  );
  return (matching || lines[0] || "").slice(0, 180);
}

export function searchFeatureSessions(
  query: string,
  limit = 5,
): SessionSearchResult[] {
  const terms = tokens(query);
  if (terms.length === 0) return [];

  return listPhaseSessions()
    .map((dir) => {
      const feature = path.basename(dir);
      const text = `${feature}\n${readMarkdownFiles(dir)}`;
      return {
        feature,
        path: dir,
        score: scoreText(text, terms),
        summary: summarizeSession(dir, text, terms),
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.feature.localeCompare(b.feature))
    .slice(0, limit);
}

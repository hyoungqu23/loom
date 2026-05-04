import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture";
import { runPhase } from "../../src/phases/runner";
import {
  createPhaseSession,
  loadContext,
  loadPlan,
} from "../../src/phases/session";
import { clearDefaultsCache, saveWorkspaceConfig } from "../../src/config";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";

let tmp: string;
let originalWorkspace: string;
let stubBin: string;

let stubCounter = 0;
function writeStub(stdout: string): string {
  stubCounter += 1;
  const file = path.join(tmp, `stub-${stubCounter}.sh`);
  fs.writeFileSync(
    file,
    `#!/bin/sh\ncat <<'OUTPUT'\n${stdout}\nOUTPUT\nexit 0\n`,
  );
  fs.chmodSync(file, 0o755);
  return file;
}

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-extract-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
  clearDefaultsCache();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  clearDefaultsCache();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("runPhase auto-extract (C-1)", () => {
  it("writes CONTEXT.md from discuss worker output", async () => {
    stubBin = writeStub(`
## 결론 한 줄
사용자 인증 흐름을 단순화한다.

## 계획
- magic link 로그인 추가
- 비밀번호 정책 강화

## 미결 질문
- 세션 만료 시간을 어떻게 정할지
`.trim());
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: stubBin, extraArgs: [] },
        claude: { command: stubBin, extraArgs: [] },
        gemini: { command: stubBin, extraArgs: [] },
        ollama: { command: stubBin, extraArgs: [] },
      },
    });
    clearDefaultsCache();

    const dir = createPhaseSession("auth-cleanup");
    await captureConsole([], async () => {
      await runPhase(dir, "discuss", {
        task: "x",
        flags: {},
        synthesize: false,
      });
    });

    const ctx = loadContext(dir);
    expect(ctx).not.toBeNull();
    expect(ctx?.problem).toBe("사용자 인증 흐름을 단순화한다.");
    expect(ctx?.decisions).toEqual([
      "magic link 로그인 추가",
      "비밀번호 정책 강화",
    ]);
    expect(ctx?.openQuestions).toEqual([
      "세션 만료 시간을 어떻게 정할지",
    ]);
  });

  it("writes PLAN.md from plan worker output (with risks + AC)", async () => {
    stubBin = writeStub(`
## 결론 한 줄
GraphQL 게이트웨이 도입.

## 계획
- 스키마 정의
- 인증 미들웨어
- 캐시 정책

## 리스크
- 운영 도구 학습 비용
`.trim());
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: stubBin, extraArgs: [] },
        claude: { command: stubBin, extraArgs: [] },
        gemini: { command: stubBin, extraArgs: [] },
        ollama: { command: stubBin, extraArgs: [] },
      },
    });
    clearDefaultsCache();

    const dir = createPhaseSession("graphql-gateway");
    await captureConsole([], async () => {
      await runPhase(dir, "plan", {
        task: "x",
        flags: {},
        synthesize: false,
      });
    });

    const plan = loadPlan(dir);
    expect(plan).not.toBeNull();
    expect(plan?.approach).toBe("GraphQL 게이트웨이 도입.");
    expect(plan?.acceptanceCriteria).toEqual([
      "스키마 정의",
      "인증 미들웨어",
      "캐시 정책",
    ]);
    expect(plan?.risks).toEqual(["운영 도구 학습 비용"]);
  });

  it("does not overwrite the existing CONTEXT.md problem when re-running discuss", async () => {
    stubBin = writeStub(`
## 결론 한 줄
신규 결론 (덮어쓰지 말 것).

## 계획
- 새 항목
`.trim());
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: stubBin, extraArgs: [] },
        claude: { command: stubBin, extraArgs: [] },
        gemini: { command: stubBin, extraArgs: [] },
        ollama: { command: stubBin, extraArgs: [] },
      },
    });
    clearDefaultsCache();

    const dir = createPhaseSession("preserve-problem");

    // Seed an existing CONTEXT.md so we can test merge.
    const seedStub = writeStub(`
## 결론 한 줄
기존 결론 (지켜져야 함).

## 계획
- 기존 항목
`.trim());
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: seedStub, extraArgs: [] },
        claude: { command: seedStub, extraArgs: [] },
        gemini: { command: seedStub, extraArgs: [] },
        ollama: { command: seedStub, extraArgs: [] },
      },
    });
    clearDefaultsCache();
    await captureConsole([], async () => {
      await runPhase(dir, "discuss", {
        task: "x",
        flags: {},
        synthesize: false,
      });
    });

    // Now flip the runtime to the new stub and re-run discuss.
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: stubBin, extraArgs: [] },
        claude: { command: stubBin, extraArgs: [] },
        gemini: { command: stubBin, extraArgs: [] },
        ollama: { command: stubBin, extraArgs: [] },
      },
    });
    clearDefaultsCache();
    await captureConsole([], async () => {
      await runPhase(dir, "discuss", {
        task: "y",
        flags: {},
        synthesize: false,
      });
    });

    const ctx = loadContext(dir);
    expect(ctx?.problem).toBe("기존 결론 (지켜져야 함).");
    // Decisions should be the union (deduped).
    expect(ctx?.decisions).toContain("기존 항목");
    expect(ctx?.decisions).toContain("새 항목");
  });

  it("does not write CONTEXT.md when worker output has no recognised sections", async () => {
    stubBin = writeStub("just some prose with no headings");
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: stubBin, extraArgs: [] },
        claude: { command: stubBin, extraArgs: [] },
        gemini: { command: stubBin, extraArgs: [] },
        ollama: { command: stubBin, extraArgs: [] },
      },
    });
    clearDefaultsCache();

    const dir = createPhaseSession("noise");
    await captureConsole([], async () => {
      await runPhase(dir, "discuss", {
        task: "x",
        flags: {},
        synthesize: false,
      });
    });

    expect(fs.existsSync(path.join(dir, "CONTEXT.md"))).toBe(false);
  });

  it("writes memory candidates from reflect worker output", async () => {
    stubBin = writeStub(`
## 배운 점
- Non-interactive autopilot needs explicit gate policy.

## 재사용 절차
- Run npm run check before commits.

## 사용자 선호
- Always respond in Korean.
`.trim());
    saveWorkspaceConfig({
      runtimes: {
        codex: { command: stubBin, extraArgs: [] },
        claude: { command: stubBin, extraArgs: [] },
        gemini: { command: stubBin, extraArgs: [] },
        ollama: { command: stubBin, extraArgs: [] },
      },
    });
    clearDefaultsCache();

    const dir = createPhaseSession("reflect-memory");
    await captureConsole([], async () => {
      await runPhase(dir, "reflect", {
        task: "x",
        flags: {},
        synthesize: false,
      });
    });

    const candidatesDir = path.join(tmp, ".loom", "memory", "candidates");
    const files = fs.readdirSync(candidatesDir).sort();
    expect(files.length).toBe(3);
    const bodies = files.map((file) =>
      fs.readFileSync(path.join(candidatesDir, file), "utf8"),
    );
    expect(bodies.join("\n")).toContain("kind: project");
    expect(bodies.join("\n")).toContain("kind: procedure");
    expect(bodies.join("\n")).toContain("kind: user");
    expect(bodies.join("\n")).toContain("Always respond in Korean.");
  });
});

# 코드 리뷰 후속 개선 플랜 (2026-05)

리뷰에서 도출한 9개 이슈에 대해 **(a) 이슈 재검증 → (b) 해결책** 순으로 정리한다.

각 이슈 헤더의 상태 라벨은 다음과 같다.

- ✅ **유효 (Confirmed)** — 코드 재검증 후에도 실제 결함으로 판단됨
- ⚠️ **약한 이슈 (Weak)** — 동작상 문제는 없거나 좁은 시나리오에만 영향. 스타일·사용성 개선 권장
- ❌ **무효 (Rejected)** — 재검증 결과 잘못 짚었거나 의도된 동작

---

## Issue 1 — secret redaction 패턴이 좁다 ✅ 유효

### 재검증

`src/util/redact.ts:1-4`의 `SECRET_PATTERNS`는 두 가지만 매칭한다.

```ts
/\b[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY)[A-Z0-9_]*\s*=\s*[^\s`'"]+/gi
/\bsk-[A-Za-z0-9_-]{12,}\b/g
```

`grep redactText` 결과 적용 지점은 두 곳이다.

- `src/commands/cron.ts:16` — `loom cron list` 출력
- `src/trajectory/export.ts:26,42,53` — 트레일 export (외부 공유 경로)

워커 stdout이 `.loom/features/<slug>/workers/`에 그대로 적재되는 경로
(`src/phases/session.ts:123-140`, `src/engine/worker.ts:110`)에는 redact 미적용. 단 `.loom/`은 `.gitignore`에 들어 있어 git 커밋으로의 누출은 막혀 있다.

**진짜 이슈는 "패턴 자체가 좁다"** — 흔한 시크릿 형태(GitHub PAT, AWS access key, Slack token, Bearer header, JSON 형태 키)가 누락됨. trajectory export로 외부 공유 시 누출 위험.

**워커 stdout 자동 redact는 별개 trade-off** — 디버깅 가독성과 충돌하므로 강제 적용은 부적절.

### 해결책

**1-1. 패턴 추가** (`src/util/redact.ts`)

```ts
const SECRET_PATTERNS: RegExp[] = [
  /\b[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY)[A-Z0-9_]*\s*=\s*[^\s`'"]+/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g, // OpenAI / Anthropic
  /\bgh[ps]_[A-Za-z0-9]{30,}\b/g, // GitHub PAT (ghp_, ghs_)
  /\bgho_[A-Za-z0-9]{30,}\b/g, // GitHub OAuth
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /(["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret)["']?\s*[:=]\s*["'])([^"'\s]{8,})(["'])/gi,
  /\b[Bb]earer\s+[A-Za-z0-9._\-+/=]{16,}\b/g,
];
```

캡처 그룹이 있는 패턴(JSON-shaped)은 키 이름은 보존하고 값만 `[REDACTED]`로 치환하도록 `redactText`도 같이 수정.

**1-2. 워커 stdout redact는 옵션 플래그로** — `LOOM_REDACT_WORKER_OUTPUT=1`(또는 config flag)일 때만 `appendWorkerOutput`에서 적용. 기본값은 현재처럼 raw 유지.

**1-3. 테스트 추가** — 새 패턴별로 각 형태 1건씩 `tests/util/redact.test.ts`(없으면 신규).

---

## Issue 2 — 워커 환경변수 무차별 노출 ✅ 유효

### 재검증

`src/engine/spawn.ts:25` `env: process.env` 그대로 child에 전달.
LLM CLI 인증을 위해 일부 변수는 필수(예: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OLLAMA_HOST`)지만, AWS·DB·결제 같은 인접 시크릿이 함께 노출됨. LLM이 임의 명령을 실행할 수 있는 환경이라 데이터 유출 경로가 됨.

### 해결책

**2-1. 런타임별 env allow-list 정의** (`src/runtimes/<adapter>.ts`, `src/runtimes/adapter.ts`)

현재 `RuntimeAdapter`는 `buildSpec`/`versionArgs`만 갖고 있고, `RuntimeSpec`에도 env 필드가 없다.
따라서 adapter contract를 먼저 넓힌다.

```ts
export type RuntimeAdapter = {
  name: string;
  buildSpec(args: BuildSpecArgs): RuntimeSpec;
  versionArgs: string[];
  envAllowlist?: string[];
};
```

각 adapter에 기본값을 둔다. `*` 와일드카드 suffix는 prefix match로만 지원한다.

```ts
// codex.ts
envAllowlist: ["PATH", "HOME", "TMPDIR", "OPENAI_API_KEY", "CODEX_*"];
// claude.ts
envAllowlist: ["PATH", "HOME", "TMPDIR", "ANTHROPIC_API_KEY", "CLAUDE_*"];
// gemini.ts
envAllowlist: ["PATH", "HOME", "TMPDIR", "GOOGLE_API_KEY", "GEMINI_*"];
// ollama.ts
envAllowlist: ["PATH", "HOME", "TMPDIR", "OLLAMA_*"];
```

**2-2. `RuntimeSpec.env` 추가 + `runSpec` 적용** (`src/types.ts`, `src/engine/spawn.ts`)

```ts
export type RuntimeSpec = {
  command: string;
  args: string[];
  cwd: string;
  stdin?: string;
  env?: NodeJS.ProcessEnv;
};
```

`runSpec`는 다음 순서로 env를 정한다.

```ts
env: spec.env ?? process.env
```

기본 fallback을 남겨 기존 테스트와 커스텀 spec 호출을 깨지 않되, 정규 runtime 경로는 아래 2-3에서 필터된 env를 넣는다.

**2-3. `buildRuntimeCommand`에서 env 필터 적용** (`src/runtimes/index.ts`)

adapter가 만든 spec에 `env`를 덧씌운다. 이 위치가 적절한 이유는 `buildRuntimeCommand`가 runtime 이름, adapter, config, `RunOptions`를 모두 알고 있는 유일한 경계이기 때문이다.

```ts
const spec = adapter.buildSpec({ prompt, cwd, model, config, options });
return {
  ...spec,
  env:
    options.envPassthrough === "full"
      ? process.env
      : filterEnv(process.env, adapter.envAllowlist ?? DEFAULT_RUNTIME_ENV_ALLOWLIST),
};
```

`filterEnv`는 별도 util로 둬서 wildcard, case-sensitive key match, 최소 공통 env(`PATH`, `HOME`, `TMPDIR`)를 테스트한다.

**2-4. opt-out 플래그 plumbing** (`src/types.ts`, `src/engine/worker.ts`, `src/runtimes/index.ts`)

`RunOptions`에 `envPassthrough?: "full" | "allowlist"`를 추가하고, `resolveAgentRun`에서 `--env-passthrough=full`을 읽어 넣는다. 허용 값이 아니면 명시적 에러를 낸다.

**2-5. 마이그레이션 완화**

첫 릴리스에선 allow-list 적용 시 `request.json`에 `envPolicy`와 `filteredEnvCount`를 기록한다. stderr에 매번 쓰면 LLM 출력 파싱을 오염시킬 수 있으므로, 사용자-facing 경고는 `--verbose` 또는 doctor/check 경로에서만 출력한다.

**2-6. 테스트**

- `tests/runtimes/env.test.ts` 신규: allow-list exact/prefix match, opt-out full passthrough, 기본 공통 env 보존
- `tests/engine/spawn.test.ts`: `RuntimeSpec.env`가 child에 전달되고 fallback은 `process.env`인 것을 검증
- adapter별 테스트: `buildRuntimeCommand(...).env`가 포함되는지 검증

---

## Issue 3 — ollama 어댑터의 ARG_MAX 위험 ✅ 유효

### 재검증

`src/runtimes/ollama.ts:13` — prompt를 argv로 전달. macOS는 `ARG_MAX ≈ 256KB`, Linux는 보통 `2MB`. Loom 시스템 프롬프트는 common + role + skills + memory + handoff(prior outputs 7 phases × 1500자 + plan + context) + contract + task로 누적되어 큰 task에선 임계 근처에 도달할 수 있음.

주석에 명시된 stdin 회피 사유(REPL 트리거)는 `tests/runtimes/ollama.test.ts`로 lock-in 되어 있어 함부로 stdin으로 못 바꿈.

### 해결책

**3-1. 길이 가드** (`src/runtimes/ollama.ts`)

```ts
const OLLAMA_ARGV_LIMIT = 100_000; // 보수적, 모든 OS 안전 영역

if (Buffer.byteLength(prompt) > OLLAMA_ARGV_LIMIT) {
  throw new Error(
    `ollama: prompt too large for argv (${Buffer.byteLength(prompt)} bytes > ${OLLAMA_ARGV_LIMIT}). ` +
      `Lower MAX_PRIOR_OUTPUT_CHARS, drop --include-secondary, or switch runtime.`,
  );
}
```

**3-2. 길이 가드 테스트** — 100KB 초과 prompt에 대해 buildSpec이 throw 하는지 확인.

**3-3. (선택) 옵션 stdin fallback** — `--ollama-stdin` 플래그가 있을 때만 stdin으로 보내는 코드 경로를 두되 기본은 argv. 기존 ollama.test.ts는 그대로 통과.

---

## Issue 4 — risk classifier 적용 범위 ❌ 무효 (재검토 결과 잘못 짚음)

### 재검증

리뷰 본문에서 “cron 경로에서 SAFE_COMMANDS에 없는 일반 명령(make, bash 등)이 `low`로 분류되어 approvalMode 게이트를 통과한다”고 적었으나, `src/cron/jobs.ts:73`을 다시 읽으면

```ts
if (risk.level !== "safe" && job.approvalMode !== "allow-risky") {
  throw new Error(`cron job blocked by approval policy: ${risk.reason}`);
}
```

즉 **`safe`가 아닌 모든 레벨(low/medium/high)이 차단**된다. SAFE_COMMANDS에 없는 임의 명령은 `low`로 떨어져도 throw. 오히려 매우 strict하다.

worker spawn 경로(`src/engine/worker.ts:77`)는 `level === "high"`만 차단하지만, 거기서 `worker.spec.command`는 항상 LLM CLI(codex/claude/gemini/ollama) — `secret-access`/`destructive` 카테고리에 들어갈 일이 없으므로 항상 `low`. 이건 "no private APIs, just process orchestration" 원칙상 의도된 동작이며 `approvalScope: "runtime-command-only"`로 코드에서 자기 한계를 표시.

### 결론

이슈 자체가 잘못된 짚음. **변경 작업 없음**.

(굳이 한 가지를 남긴다면, cron의 `risk.level !== "safe"` 차단 정책은 너무 엄격해서 `low` 명령조차 매번 `--approval-mode allow-risky`를 요구한다는 사용성 문제가 있을 수 있다. 하지만 이는 "이슈 4"와는 다른 이야기이며, 별건으로 다루는 게 적절.)

---

## Issue 5 — cron CLI에 add 서브커맨드 없음 ⚠️ 약한 이슈

### 재검증

`src/commands/cron.ts:5-31`은 `list`/`run`만 구현. 그러나 `addCronJob`은 `src/cron/jobs.ts:56`에 export 되어 있고, 테스트 파일들이 직접 호출(`tests/cron/jobs.test.ts`, `tests/commands/cron.test.ts`).

**의도된 디자인일 가능성** — Loom은 markdown/json 파일을 직접 편집하는 모델을 따르고 있다(STATE.md, CONTEXT.md, PLAN.md, harness/phases.md 등 모두 사람이 직접 편집). cron jobs.json도 같은 라인에 있다고 보면 자연스럽다.

다만 README/help/docs 어디에도 “jobs.json 직접 편집” 안내가 없어 사용성 함정.

### 해결책

다음 중 택일.

**5-A. 직접 편집 모델 유지 + 문서화** (권장, 변경 최소)

- `docs/USAGE.md`에 cron 섹션 추가: `.loom/cron/jobs.json` 스키마 + 예시
- `loom cron list`가 비어 있을 때 `(none configured — see docs/USAGE.md#cron)` 같은 안내
- `loom help`에도 cron 항목 한 줄 추가

**5-B. CLI에 add/remove/enable/disable 추가** (사용성 개선)

```bash
loom cron add <id> --schedule "0 9 * * *" --command npm --args "test" --feature my-feat
loom cron remove <id>
loom cron enable <id>
loom cron disable <id>
```

`addCronJob`은 이미 있으니 wiring만 필요. risk gate는 jobs.ts에서 이미 강제되므로 CLI에서 별도 검증 불필요.

본 플랜에선 **5-A로 가고, 5-B는 별건 백로그**로 남길 것을 권장 — 현재 디자인 철학과 일관됨.

---

## Issue 6 — cron 실행 결과가 디스크에 남지 않음 ✅ 유효

### 재검증

`src/cron/jobs.ts:82-89` `runSpec` 호출 후 `lastStatus`만 jobs.json에 기록. stdout/stderr 폐기. 메트릭 이벤트도 phase만 다룸(`src/metrics/events.ts:6` MetricEvent type이 `type: "phase"`만 정의). cron job 실패 시 디버깅 자료가 없음.

### 해결책

**6-1. cron run당 디렉토리 생성**

기존 runtime-runs 패턴(`src/engine/runtime.ts:10-19`)을 차용.

```ts
function cronRunDir(id: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(
    ensureWorkspaceState(),
    "cron",
    "runs",
    `${stamp}-${id}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
```

**6-2. runCronJob에서 stdout/stderr/result.json 저장**

```ts
const dir = cronRunDir(id);
const result = await runSpec(spec, DEFAULT_RUNTIME_TIMEOUT_MS);
fs.writeFileSync(path.join(dir, "stdout.log"), redactText(result.stdout));
fs.writeFileSync(path.join(dir, "stderr.log"), redactText(result.stderr));
writeJson(path.join(dir, "result.json"), {
  id, status: result.status, signal: result.signal,
  startedAt: ..., finishedAt: new Date().toISOString(),
});
```

저장 시점에 `redactText` 적용 — Issue 1의 패턴 강화 효과를 자동으로 받음.

**6-3. metrics 확장**

`MetricEvent`에 `type: "cron"` variant 추가:

```ts
type CronMetric = {
  type: "cron";
  id: string;
  status: number | null;
  durationMs: number;
  at?: string;
};
```

`appendMetricEvent`는 union을 받게 변경. `summarizeMetrics`/`summarizeSkillReview`는 phase만 보도록 이미 가드되어 있어 호환.

**6-4. retention** — 무한 누적을 막기 위해 `runCronJob` 끝에 같은 id의 30일 이상 묵은 디렉토리는 정리. 단순 fs.readdirSync + mtime 비교로 충분.

**6-5. 테스트** — `tests/cron/jobs.test.ts`에 stdout 캡처와 result.json 작성을 검증하는 케이스 추가.

---

## Issue 7 — runCliCommand의 글로벌 console 패치 ⚠️ 약한 이슈

### 재검증

`src/cli.ts:86-116` — `console.log`/`console.error`를 글로벌로 patch한 뒤 finally에서 복구. `cliCommandQueue`로 직렬화는 되지만 동일 프로세스의 다른 비동기 작업(독립 timer 콜백 등)이 같은 시점에 `console.log`를 호출하면 그 출력도 캡처되어 stdout/stderr 결과에 섞임.

실사용 시나리오는 좁다 — 일반 CLI 진입점은 `bin/loom.js`가 `main()`을 직접 호출. `runCliCommand`는 테스트나 임베딩 시나리오에서만 사용됨. 실질 위험은 낮음.

다만 이미 도메인에 `LogSink` 타입이 정의되어 있고(`src/types.ts:161`) TUI sink가 sink 패턴으로 동작하므로, 같은 패턴으로 정리하는 게 일관됨.

### 해결책

**7-1. Sink 주입 형태로 리팩터** — 이미 sink가 도메인에 존재하므로 깊은 변경은 아님.

```ts
type LogSink = { log(...args: unknown[]): void; error(...args: unknown[]): void };

export async function main(argv: string[], sink?: LogSink): Promise<void> { ... }

export async function runCliCommand(argv: string[]): Promise<CliCommandResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const sink: LogSink = {
    log: (...args) => stdout.push(args.map(String).join(" ")),
    error: (...args) => stderr.push(args.map(String).join(" ")),
  };
  try {
    await main(argv, sink);
    return { status: "ok", stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } catch (e) { ... }
}
```

**7-2. command 파일들 점진적 마이그레이션** — `console.log`를 `sink.log`로 치환. `sink`가 없는 호출은 `console`로 fallback해서 외부 호환 유지.

**7-3. 큐 제거** — sink 주입 후 `cliCommandQueue` 직렬화도 불필요.

**비용/이익 평가** — 변경 폭이 적지 않다(commands/* 전체 console 호출 추적). 단기 우선순위에선 *현재 구현 유지\* + 리스크 주석 추가가 합리적. 백로그에 두고 다른 commands 변경 작업과 묶어 처리.

---

## Issue 8 — mixed export style ⚠️ 약한 이슈

### 재검증

`src/cli.ts:135-140`

```ts
export async function main(...) // ESM-style
export { buildRuntimeCommand };
export { runRuntime };

module.exports = {              // CommonJS override
  main,
  runCliCommand,
  buildRuntimeCommand,
  runRuntime,
};
```

TS `module: CommonJS` 컴파일에서 `module.exports = X` 대입은 그 모듈의 exports 객체를 통째로 교체한다. 위에 있는 `export` 키워드들로 만든 named export는 컴파일 결과에서 사라질 수 있음(또는 `module.exports` 객체와 합쳐질 수 있음 — 컴파일러 버전과 옵션에 따라 다름).

테스트가 759개 통과하므로 현재 사용처는 모두 정상이지만, 외부에서 `import { main } from "loom/cli"`(ESM)와 `require("loom/cli").main`(CJS) 두 가지 진입점이 동시에 안전한지는 컴파일 결과 확인 필요. 코드 리뷰 시 헷갈림 자체가 부채.

### 해결책

**8-1. 한쪽으로 통일 — TS export만 유지**

현재 프로젝트는 `module: CommonJS`로 빌드되므로 TypeScript의 `export` 문만으로도 컴파일 결과가 `exports.main = main` 형태의 CommonJS named export가 된다. 수동 `module.exports = { ... }` 대입은 TS가 만든 exports 객체를 다시 덮어써서 리뷰와 타입 추론을 헷갈리게 하므로 제거한다.

```ts
// src/cli.ts (끝부분)
export async function main(...) { ... }
export async function runCliCommand(...) { ... }
export { buildRuntimeCommand };
export { runRuntime };

// module.exports 대입 없음
```

`bin/loom.js`가 `require("../dist/cli").main`처럼 named export를 읽는 구조라면 그대로 동작한다. 아니라면 bin shim도 TS export 결과에 맞춰 `const { main } = require("../dist/cli")` 형태로 정리한다.

**8-2. 검증**

- `npm run build`
- `node -e 'const cli=require("./dist/cli"); console.log(Object.keys(cli).sort())'`에서 `buildRuntimeCommand`, `main`, `runCliCommand`, `runRuntime` 확인
- `npm test`

---

## Issue 9 — memory metadata 파싱 느슨 ⚠️ 약한 이슈

### 재검증

`src/memory/store.ts:70-91` `parseMetadata`는 `key: value` 단순 split. 콜론이 값에 들어가면 잘림. 현재 작성되는 메타데이터는

- `source: reflect:add-dark-mode:배운 점` ← **콜론 포함**
- `confidence: medium`
- `updatedAt: 2026-05-04T14:00:00.000Z` ← **콜론 포함 (ISO timestamp)**
- `tags: reflect, learning`

`parseMetadata`는 `line.indexOf(":")`로 첫 콜론 기준 split하니 ISO timestamp와 source 모두 의도된 동작으로 들어간다(value 쪽에 콜론 포함된 채). 즉 **현재 데이터 형식에선 실제 결함 없음**.

### 결론

- 즉시 수정 불필요 (false positive에 가까움)
- 향후 사용자가 메모리를 직접 편집해서 multi-line value, escape, nested 구조가 필요해지면 그때 yaml 도입 검토

### 백로그용 메모

만약 향후 변경한다면:

- `js-yaml` 또는 가벼운 inline yaml subset 파서로 교체
- frontmatter는 이미 `---\n...\n---` 형태이므로 yaml lib와 매끄럽게 통합

---

## 우선순위 요약 (재검증 후)

| Issue                        | 상태    | 우선순위             | 작업량      |
| ---------------------------- | ------- | -------------------- | ----------- |
| 1. redact 패턴 강화          | ✅ 유효 | **높음**             | 작음        |
| 2. env allow-list            | ✅ 유효 | **높음**             | 중간        |
| 6. cron 결과 영속화          | ✅ 유효 | **높음**             | 중간        |
| 3. ollama 길이 가드          | ✅ 유효 | 중간                 | 작음        |
| 5-A. cron 사용성 (문서화)    | ⚠️ 약함 | 중간                 | 작음        |
| 8. cli.ts export 통일        | ⚠️ 약함 | 낮음                 | 작음        |
| 7. console patch → sink 주입 | ⚠️ 약함 | 낮음                 | 큼 (백로그) |
| 9. metadata 파서 yaml화      | ⚠️ 약함 | 낮음 (사실상 불필요) | —           |
| 4. risk classifier           | ❌ 무효 | —                    | 변경 없음   |

### 권장 1차 PR 묶음

이슈 1 + 2 + 3 + 6 + 5-A를 하나의 PR(또는 최대 두 개)로 묶는다 — 모두 _security/operability hardening_ 카테고리이며 한 명의 리뷰어가 컨텍스트 전환 없이 검토 가능.

### 백로그

- 7 (sink 주입) — UX/리팩터 작업과 같이
- 8 (export 통일) — 다음 리팩터 사이클에 한꺼번에
- 5-B (cron CLI add/remove) — 사용자 요청 발생 시

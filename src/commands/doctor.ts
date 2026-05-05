import { Flags } from "../types.js";
import { loadDefaults } from "../config.js";
import { commandExists } from "../util/shell.js";
import { runtimeVersion } from "../runtimes/index.js";
import { runtimeCapabilityRows } from "../runtimes/capabilities.js";
import { runRuntime } from "../engine/index.js";
import { workspaceRoot } from "../workspace.js";
import { flagBool, flagNumber, flagString } from "../util/parse-args.js";
import { createAnsi } from "../tui/ansi.js";
import { detectColorMode } from "../tui/isTty.js";

function smokePrompt(runtime: string): string {
  return `Return exactly: LOOM_WORKER_OK_${runtime.toUpperCase()}`;
}

export async function runDoctor(flags: Flags): Promise<void> {
  const defaults = loadDefaults();
  const wantedRaw = flagString(flags.runtimes);
  const wanted = wantedRaw
    ? new Set(wantedRaw.split(",").map((name) => name.trim()).filter(Boolean))
    : null;
  const smoke = flagBool(flags.smoke);
  const timeoutMs = flagNumber(flags.timeout, 60_000);

  const ansi = createAnsi(
    detectColorMode({
      isTTY: Boolean(process.stdout.isTTY),
      env: process.env,
    }),
  );

  console.log(ansi.bold(`Runtime Doctor${smoke ? " + Smoke" : ""}`) + "\n");
  for (const [runtime, config] of Object.entries(defaults.runtimes)) {
    if (wanted && !wanted.has(runtime)) continue;
    const found = commandExists(config.command);
    if (!found.ok) {
      console.log(
        `${runtime.padEnd(7)} ${ansi.red("MISS")}  ${config.command} not found`,
      );
      continue;
    }
    const version = runtimeVersion(runtime, config.command);
    const versionText =
      version.stdout || version.stderr || "version unavailable";
    console.log(
      `${runtime.padEnd(7)} ${ansi.green("OK")}    ${found.path}    ${ansi.dim(versionText.split("\n")[0])}`,
    );
    console.log(`         ${runtimeCapabilityRows([runtime])[0].trim()}`);

    if (!smoke) continue;
    const prompt = smokePrompt(runtime);
    const { dir, result } = await runRuntime(runtime, prompt, {
      cwd: workspaceRoot(),
      timeoutMs,
    });
    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();
    const expected = `LOOM_WORKER_OK_${runtime.toUpperCase()}`;
    const smokeOk = result.status === 0 && stdout.includes(expected);
    const verdict = smokeOk ? ansi.green("OK") : ansi.red("FAIL");
    console.log(
      `         smoke ${verdict} status=${result.status == null ? "null" : result.status} session=${dir}`,
    );
    if (!smokeOk && stdout) {
      console.log(
        `         stdout: ${stdout.slice(0, 200).replace(/\s+/g, " ")}`,
      );
    }
    if (stderr) {
      console.log(
        `         stderr: ${stderr.slice(0, 300).replace(/\s+/g, " ")}`,
      );
    }
  }
}

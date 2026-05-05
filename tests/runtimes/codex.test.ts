import { describe, expect, it } from "vitest";
import { codexAdapter } from "../../src/runtimes/codex.js";
import { RuntimeConfig, RunOptions } from "../../src/types.js";

const baseConfig = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
  command: "codex",
  model: "gpt-5.5",
  ...overrides,
});

const baseArgs = (
  overrides: { config?: Partial<RuntimeConfig>; options?: RunOptions } = {},
) => ({
  prompt: "do thing",
  cwd: "/tmp/cwd",
  model: "gpt-5.5",
  config: baseConfig(overrides.config),
  options: overrides.options ?? {},
});

describe("codexAdapter", () => {
  it("uses 'codex' as its name", () => {
    expect(codexAdapter.name).toBe("codex");
  });

  it("requests --version for runtime version probing", () => {
    expect(codexAdapter.versionArgs).toEqual(["--version"]);
  });
});

describe("codexAdapter.buildSpec", () => {
  it("invokes the configured command", () => {
    const spec = codexAdapter.buildSpec(baseArgs());
    expect(spec.command).toBe("codex");
  });

  it("forwards the prompt as stdin (NOT as an argv slot)", () => {
    const spec = codexAdapter.buildSpec(baseArgs());
    expect(spec.stdin).toBe("do thing");
    expect(spec.args).not.toContain("do thing");
  });

  it("uses 'exec' subcommand and passes model/cwd via flags", () => {
    const spec = codexAdapter.buildSpec(baseArgs());
    expect(spec.args).toContain("exec");
    expect(spec.args).toContain("--model");
    expect(spec.args).toContain("gpt-5.5");
    expect(spec.args).toContain("--cd");
    expect(spec.args).toContain("/tmp/cwd");
  });

  it("uses 'read-only' as the default sandbox", () => {
    const spec = codexAdapter.buildSpec(baseArgs());
    const idx = spec.args.indexOf("--sandbox");
    expect(spec.args[idx + 1]).toBe("read-only");
  });

  it("prefers options.sandbox over config.sandbox", () => {
    const spec = codexAdapter.buildSpec(
      baseArgs({
        config: { sandbox: "config-sandbox" },
        options: { sandbox: "option-sandbox" },
      }),
    );
    const idx = spec.args.indexOf("--sandbox");
    expect(spec.args[idx + 1]).toBe("option-sandbox");
  });

  it("uses config.sandbox when options.sandbox is absent", () => {
    const spec = codexAdapter.buildSpec(
      baseArgs({ config: { sandbox: "ws-sandbox" } }),
    );
    const idx = spec.args.indexOf("--sandbox");
    expect(spec.args[idx + 1]).toBe("ws-sandbox");
  });

  it("appends extraArgs from runtime config", () => {
    const spec = codexAdapter.buildSpec(
      baseArgs({ config: { extraArgs: ["--skip-git-repo-check", "--ephemeral"] } }),
    );
    expect(spec.args).toContain("--skip-git-repo-check");
    expect(spec.args).toContain("--ephemeral");
  });

  it("ends args with a single trailing '-' to read prompt from stdin", () => {
    const spec = codexAdapter.buildSpec(baseArgs());
    expect(spec.args[spec.args.length - 1]).toBe("-");
  });

  it("sets cwd on the spec", () => {
    const spec = codexAdapter.buildSpec(baseArgs());
    expect(spec.cwd).toBe("/tmp/cwd");
  });
});

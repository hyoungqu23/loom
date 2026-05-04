import { describe, expect, it } from "vitest";
import { claudeAdapter } from "../../src/runtimes/claude";
import { RuntimeConfig, RunOptions } from "../../src/types";

const baseConfig = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
  command: "claude",
  model: "opus",
  ...overrides,
});

const baseArgs = (
  overrides: { config?: Partial<RuntimeConfig>; options?: RunOptions } = {},
) => ({
  prompt: "task body",
  cwd: "/tmp/cwd",
  model: "opus",
  config: baseConfig(overrides.config),
  options: overrides.options ?? {},
});

describe("claudeAdapter.buildSpec", () => {
  it("invokes the configured command", () => {
    expect(claudeAdapter.buildSpec(baseArgs()).command).toBe("claude");
  });

  it("uses '-p' flag and ends with '-' (stdin sentinel)", () => {
    const spec = claudeAdapter.buildSpec(baseArgs());
    expect(spec.args[0]).toBe("-p");
    expect(spec.args[spec.args.length - 1]).toBe("-");
  });

  it("sends the prompt as stdin (NOT as argv)", () => {
    const spec = claudeAdapter.buildSpec(baseArgs());
    expect(spec.stdin).toBe("task body");
    expect(spec.args).not.toContain("task body");
  });

  it("passes the model via --model", () => {
    const spec = claudeAdapter.buildSpec(baseArgs());
    const idx = spec.args.indexOf("--model");
    expect(spec.args[idx + 1]).toBe("opus");
  });

  it("uses 'plan' as the default permission mode", () => {
    const spec = claudeAdapter.buildSpec(baseArgs());
    const idx = spec.args.indexOf("--permission-mode");
    expect(spec.args[idx + 1]).toBe("plan");
  });

  it("prefers options.permissionMode over config.permissionMode", () => {
    const spec = claudeAdapter.buildSpec(
      baseArgs({
        config: { permissionMode: "config-mode" },
        options: { permissionMode: "option-mode" },
      }),
    );
    const idx = spec.args.indexOf("--permission-mode");
    expect(spec.args[idx + 1]).toBe("option-mode");
  });

  it("includes --effort when options.effort is set", () => {
    const spec = claudeAdapter.buildSpec(
      baseArgs({ options: { effort: "high" } }),
    );
    const idx = spec.args.indexOf("--effort");
    expect(spec.args[idx + 1]).toBe("high");
  });

  it("falls back to config.effort when options.effort is missing", () => {
    const spec = claudeAdapter.buildSpec(
      baseArgs({ config: { effort: "xhigh" } }),
    );
    const idx = spec.args.indexOf("--effort");
    expect(spec.args[idx + 1]).toBe("xhigh");
  });

  it("omits --effort entirely when neither options nor config sets it", () => {
    const spec = claudeAdapter.buildSpec(baseArgs());
    expect(spec.args).not.toContain("--effort");
  });
});

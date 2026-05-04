import { describe, expect, it } from "vitest";
import { geminiAdapter } from "../../src/runtimes/gemini";
import { RuntimeConfig, RunOptions } from "../../src/types";

const baseConfig = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
  command: "gemini",
  model: "gemini-2.5-pro",
  ...overrides,
});

const baseArgs = (
  overrides: { config?: Partial<RuntimeConfig>; options?: RunOptions } = {},
) => ({
  prompt: "the task",
  cwd: "/tmp/cwd",
  model: "gemini-2.5-pro",
  config: baseConfig(overrides.config),
  options: overrides.options ?? {},
});

describe("geminiAdapter.buildSpec", () => {
  it("invokes the configured command", () => {
    expect(geminiAdapter.buildSpec(baseArgs()).command).toBe("gemini");
  });

  it("sends the prompt as stdin (not via -p value)", () => {
    const spec = geminiAdapter.buildSpec(baseArgs());
    expect(spec.stdin).toBe("the task");
  });

  it("starts with -p '' to enable stdin pipe mode", () => {
    const spec = geminiAdapter.buildSpec(baseArgs());
    expect(spec.args[0]).toBe("-p");
    expect(spec.args[1]).toBe("");
  });

  it("uses 'plan' as the default approval mode", () => {
    const spec = geminiAdapter.buildSpec(baseArgs());
    const idx = spec.args.indexOf("--approval-mode");
    expect(spec.args[idx + 1]).toBe("plan");
  });

  it("uses 'text' as the default output format", () => {
    const spec = geminiAdapter.buildSpec(baseArgs());
    const idx = spec.args.indexOf("--output-format");
    expect(spec.args[idx + 1]).toBe("text");
  });

  it("prefers options.approvalMode over config.approvalMode", () => {
    const spec = geminiAdapter.buildSpec(
      baseArgs({
        config: { approvalMode: "config-mode" },
        options: { approvalMode: "option-mode" },
      }),
    );
    const idx = spec.args.indexOf("--approval-mode");
    expect(spec.args[idx + 1]).toBe("option-mode");
  });

  it("prefers options.outputFormat over config.outputFormat", () => {
    const spec = geminiAdapter.buildSpec(
      baseArgs({
        config: { outputFormat: "json" },
        options: { outputFormat: "yaml" },
      }),
    );
    const idx = spec.args.indexOf("--output-format");
    expect(spec.args[idx + 1]).toBe("yaml");
  });

  it("passes the model via --model", () => {
    const spec = geminiAdapter.buildSpec(baseArgs());
    const idx = spec.args.indexOf("--model");
    expect(spec.args[idx + 1]).toBe("gemini-2.5-pro");
  });
});

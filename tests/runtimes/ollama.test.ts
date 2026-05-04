import { describe, expect, it } from "vitest";
import { ollamaAdapter } from "../../src/runtimes/ollama";
import { RuntimeConfig } from "../../src/types";

const baseConfig = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
  command: "ollama",
  model: "qwen2.5-coder",
  ...overrides,
});

const baseArgs = (overrides: { config?: Partial<RuntimeConfig> } = {}) => ({
  prompt: "the prompt",
  cwd: "/tmp/cwd",
  model: "qwen2.5-coder",
  config: baseConfig(overrides.config),
  options: {},
});

describe("ollamaAdapter.buildSpec", () => {
  it("invokes the configured command", () => {
    expect(ollamaAdapter.buildSpec(baseArgs()).command).toBe("ollama");
  });

  it("uses 'run <model>' subcommand structure", () => {
    const spec = ollamaAdapter.buildSpec(baseArgs());
    expect(spec.args[0]).toBe("run");
    expect(spec.args[1]).toBe("qwen2.5-coder");
  });

  it("passes the prompt as the third argv (NOT via stdin)", () => {
    const spec = ollamaAdapter.buildSpec(baseArgs());
    expect(spec.args[2]).toBe("the prompt");
    expect(spec.stdin).toBeUndefined();
  });

  it("sets cwd on the spec", () => {
    const spec = ollamaAdapter.buildSpec(baseArgs());
    expect(spec.cwd).toBe("/tmp/cwd");
  });

  it("throws when the prompt exceeds the argv byte ceiling", () => {
    const huge = "a".repeat(120_000);
    expect(() =>
      ollamaAdapter.buildSpec({ ...baseArgs(), prompt: huge }),
    ).toThrow(/prompt too large for argv/);
  });

  it("accepts a prompt right at the byte ceiling", () => {
    const right = "a".repeat(100_000);
    expect(() =>
      ollamaAdapter.buildSpec({ ...baseArgs(), prompt: right }),
    ).not.toThrow();
  });
});

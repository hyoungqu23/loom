import { afterEach, describe, expect, it } from "vitest";
import {
  redactText,
  redactValue,
  workerOutputRedactionEnabled,
} from "../../src/util/redact.js";

describe("redactText", () => {
  it("redacts env-style secret assignments", () => {
    expect(redactText("FOO_API_KEY=abc123def")).toBe("[REDACTED]");
    expect(redactText("SOME_SECRET = abc123def")).toBe("[REDACTED]");
    expect(redactText("MY_TOKEN=tok-xyz")).toBe("[REDACTED]");
    expect(redactText("DB_PASSWORD=hunter2")).toBe("[REDACTED]");
  });

  it("redacts OpenAI / Anthropic-style sk- tokens", () => {
    const masked = redactText("authorize sk-ABCDEFGHIJKLMNOP next");
    expect(masked).toBe("authorize [REDACTED] next");
  });

  it("redacts GitHub PAT and OAuth tokens", () => {
    const pat = redactText("token ghp_abcdefghijklmnopqrstuvwxyz0123456789 used");
    expect(pat).toContain("[REDACTED]");
    expect(pat).not.toContain("ghp_");

    const oauth = redactText("gho_0123456789ABCDEFGHIJabcdefghij0123456789");
    expect(oauth).toBe("[REDACTED]");

    const sec = redactText("ghs_0123456789ABCDEFGHIJabcdefghij0123456789");
    expect(sec).toBe("[REDACTED]");
  });

  it("redacts AWS access key ids", () => {
    expect(redactText("user AKIAIOSFODNN7EXAMPLE leaks")).toBe(
      "user [REDACTED] leaks",
    );
  });

  it("redacts Slack tokens", () => {
    expect(redactText("xoxb-12345-abcdefg")).toBe("[REDACTED]");
    expect(redactText("xoxp-1234567890-abcdefg")).toBe("[REDACTED]");
  });

  it("redacts Bearer authorization headers", () => {
    expect(
      redactText("Authorization: Bearer abcdef0123456789xyz"),
    ).toBe("Authorization: [REDACTED]");
    expect(redactText("bearer abcdef0123456789xyz")).toBe("[REDACTED]");
  });

  it("redacts JSON-shaped api keys while preserving the key name", () => {
    const json = redactText('{"api_key": "abcdef12345"}');
    expect(json).toBe('{"api_key": "[REDACTED]"}');

    const yaml = redactText("access_token: 'abcdef12345'");
    expect(yaml).toBe("access_token: '[REDACTED]'");

    const auth = redactText('"auth-token":"abcdef123456"');
    expect(auth).toBe('"auth-token":"[REDACTED]"');
  });

  it("leaves benign text untouched", () => {
    const benign = "loaded plan ./PLAN.md (5 modules, 3 ACs)";
    expect(redactText(benign)).toBe(benign);
  });
});

describe("redactValue", () => {
  it("recurses through arrays and objects", () => {
    const input = {
      args: ["FOO_TOKEN=secret"],
      meta: { hint: "Bearer abcdef0123456789xyz" },
    };
    const out = redactValue(input);
    expect(out.args[0]).toBe("[REDACTED]");
    expect(out.meta.hint).toBe("[REDACTED]");
  });

  it("preserves non-string primitives", () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
    expect(redactValue(null)).toBe(null);
  });
});

describe("workerOutputRedactionEnabled", () => {
  const original = process.env.LOOM_REDACT_WORKER_OUTPUT;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.LOOM_REDACT_WORKER_OUTPUT;
    } else {
      process.env.LOOM_REDACT_WORKER_OUTPUT = original;
    }
  });

  it("is off by default", () => {
    delete process.env.LOOM_REDACT_WORKER_OUTPUT;
    expect(workerOutputRedactionEnabled()).toBe(false);
  });

  it("is on for truthy values", () => {
    process.env.LOOM_REDACT_WORKER_OUTPUT = "1";
    expect(workerOutputRedactionEnabled()).toBe(true);
    process.env.LOOM_REDACT_WORKER_OUTPUT = "true";
    expect(workerOutputRedactionEnabled()).toBe(true);
  });

  it("is off for explicit zero/false", () => {
    process.env.LOOM_REDACT_WORKER_OUTPUT = "0";
    expect(workerOutputRedactionEnabled()).toBe(false);
    process.env.LOOM_REDACT_WORKER_OUTPUT = "false";
    expect(workerOutputRedactionEnabled()).toBe(false);
  });
});

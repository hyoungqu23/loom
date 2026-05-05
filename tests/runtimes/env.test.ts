import { describe, expect, it } from "vitest";
import { COMMON_RUNTIME_ENV, filterEnv } from "../../src/runtimes/env.js";
import { buildRuntimeCommand } from "../../src/runtimes/index.js";

describe("filterEnv", () => {
  it("keeps common system env vars without an explicit allowlist", () => {
    const out = filterEnv(
      { PATH: "/usr/bin", HOME: "/home/me", AWS_SECRET_ACCESS_KEY: "leak" },
      [],
    );
    expect(out.PATH).toBe("/usr/bin");
    expect(out.HOME).toBe("/home/me");
    expect(out.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("keeps allowlisted exact-match keys", () => {
    const out = filterEnv(
      { OPENAI_API_KEY: "sk-1", DATABASE_URL: "secret://" },
      ["OPENAI_API_KEY"],
    );
    expect(out.OPENAI_API_KEY).toBe("sk-1");
    expect(out.DATABASE_URL).toBeUndefined();
  });

  it("supports trailing-* prefix patterns", () => {
    const out = filterEnv(
      { CODEX_HOME: "/x", CODEX_LOG: "/y", AWS_ACCESS_KEY_ID: "AKIA" },
      ["CODEX_*"],
    );
    expect(out.CODEX_HOME).toBe("/x");
    expect(out.CODEX_LOG).toBe("/y");
    expect(out.AWS_ACCESS_KEY_ID).toBeUndefined();
  });

  it("drops keys with undefined values", () => {
    const source: NodeJS.ProcessEnv = { PATH: "/usr/bin", FOO: undefined };
    const out = filterEnv(source, []);
    expect("FOO" in out).toBe(false);
  });

  it("exposes the canonical common system env list", () => {
    expect(COMMON_RUNTIME_ENV).toContain("PATH");
    expect(COMMON_RUNTIME_ENV).toContain("HOME");
    expect(COMMON_RUNTIME_ENV).toContain("LANG");
  });
});

describe("buildRuntimeCommand env wiring", () => {
  it("attaches a filtered env by default", () => {
    const original = process.env.AWS_SECRET_ACCESS_KEY;
    const originalCodex = process.env.CODEX_HOME;
    process.env.AWS_SECRET_ACCESS_KEY = "leak";
    process.env.CODEX_HOME = "/codex";
    try {
      const spec = buildRuntimeCommand("codex", "hello", {});
      expect(spec.env).toBeDefined();
      expect(spec.env?.CODEX_HOME).toBe("/codex");
      expect(spec.env?.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(spec.env?.PATH).toBe(process.env.PATH);
    } finally {
      if (original === undefined) {
        delete process.env.AWS_SECRET_ACCESS_KEY;
      } else {
        process.env.AWS_SECRET_ACCESS_KEY = original;
      }
      if (originalCodex === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = originalCodex;
      }
    }
  });

  it("passes the full host env when envPassthrough=full", () => {
    const original = process.env.AWS_SECRET_ACCESS_KEY;
    process.env.AWS_SECRET_ACCESS_KEY = "leak";
    try {
      const spec = buildRuntimeCommand("codex", "hello", {
        envPassthrough: "full",
      });
      expect(spec.env?.AWS_SECRET_ACCESS_KEY).toBe("leak");
    } finally {
      if (original === undefined) {
        delete process.env.AWS_SECRET_ACCESS_KEY;
      } else {
        process.env.AWS_SECRET_ACCESS_KEY = original;
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { classifyCommandRisk } from "../../src/engine/risk.js";

describe("classifyCommandRisk", () => {
  it("marks common read-only commands as safe", () => {
    const risk = classifyCommandRisk({ command: "git", args: ["status"] });

    expect(risk.level).toBe("safe");
    expect(risk.categories).toEqual([]);
  });

  it("classifies destructive filesystem commands", () => {
    const risk = classifyCommandRisk({ command: "rm", args: ["-rf", "dist"] });

    expect(risk.level).toBe("high");
    expect(risk.categories).toContain("destructive");
    expect(risk.categories).toContain("filesystem-write");
  });

  it("classifies git history rewriting as high risk", () => {
    const risk = classifyCommandRisk({
      command: "git",
      args: ["reset", "--hard", "HEAD~1"],
    });

    expect(risk.level).toBe("high");
    expect(risk.categories).toContain("git-history");
    expect(risk.categories).toContain("destructive");
  });

  it("classifies network commands separately from writes", () => {
    const risk = classifyCommandRisk({ command: "curl", args: ["https://x.test"] });

    expect(risk.level).toBe("medium");
    expect(risk.categories).toContain("network");
    expect(risk.categories).not.toContain("filesystem-write");
  });

  it("classifies secret access patterns", () => {
    const risk = classifyCommandRisk({
      command: "cat",
      args: [".env"],
    });

    expect(risk.level).toBe("high");
    expect(risk.categories).toContain("secret-access");
  });
});

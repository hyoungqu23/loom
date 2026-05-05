import { describe, expect, it } from "vitest";
import { runtimeCapability, runtimeCapabilityRows } from "../../src/runtimes/capabilities.js";

describe("runtime capabilities", () => {
  it("describes known runtime support", () => {
    expect(runtimeCapability("codex")).toMatchObject({
      runtime: "codex",
      cwd: true,
      env: true,
      approvals: true,
    });
    expect(runtimeCapability("ollama")).toMatchObject({
      runtime: "ollama",
      cwd: true,
      env: true,
      approvals: false,
    });
  });

  it("returns matrix rows for doctor output", () => {
    const rows = runtimeCapabilityRows(["codex", "ollama"]);

    expect(rows).toEqual([
      expect.stringContaining("codex"),
      expect.stringContaining("ollama"),
    ]);
    expect(rows[0]).toContain("approvals");
  });
});

import { describe, expect, it } from "vitest";
import { loadInkModules } from "../../src/chat/ink.js";

describe("chat/ink", () => {
  it("exposes React.createElement and Ink render", async () => {
    const modules = await loadInkModules();

    expect(typeof modules.createElement).toBe("function");
    expect(typeof modules.render).toBe("function");
  });
});

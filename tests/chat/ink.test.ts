import { describe, expect, it } from "vitest";
import { loadInkModules } from "../../src/chat/ink.js";

describe("chat/ink", () => {
  it("loads Ink and React through the compatibility wrapper", async () => {
    const modules = await loadInkModules();

    expect(typeof modules.render).toBe("function");
    expect(typeof modules.React.createElement).toBe("function");
    expect(modules.React.createElement(modules.Box)).toMatchObject({
      type: modules.Box,
    });
    expect(modules.React.createElement(modules.Text, null, "hello")).toMatchObject({
      type: modules.Text,
      props: { children: "hello" },
    });
  });
});

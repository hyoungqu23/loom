import { describe, expect, it } from "vitest";
import { detectColorMode, detectFrameEnabled } from "../../src/tui/isTty.js";

const env = (
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> => overrides;

describe("detectColorMode", () => {
  it("returns 'ansi' on a TTY with no override env", () => {
    expect(detectColorMode({ isTTY: true, env: env() })).toBe("ansi");
  });

  it("returns 'none' off a TTY with no override env", () => {
    expect(detectColorMode({ isTTY: false, env: env() })).toBe("none");
  });

  it("NO_COLOR with any non-empty value forces 'none' even on TTY", () => {
    expect(
      detectColorMode({ isTTY: true, env: env({ NO_COLOR: "1" }) }),
    ).toBe("none");
    expect(
      detectColorMode({ isTTY: true, env: env({ NO_COLOR: "anything" }) }),
    ).toBe("none");
  });

  it("NO_COLOR='' (empty) does not disable color (per spec)", () => {
    expect(
      detectColorMode({ isTTY: true, env: env({ NO_COLOR: "" }) }),
    ).toBe("ansi");
  });

  it("FORCE_COLOR truthy forces 'ansi' off a TTY", () => {
    expect(
      detectColorMode({ isTTY: false, env: env({ FORCE_COLOR: "1" }) }),
    ).toBe("ansi");
  });

  it("FORCE_COLOR='0' is treated as falsy", () => {
    expect(
      detectColorMode({ isTTY: false, env: env({ FORCE_COLOR: "0" }) }),
    ).toBe("none");
  });

  it("NO_COLOR wins over FORCE_COLOR", () => {
    expect(
      detectColorMode({
        isTTY: true,
        env: env({ NO_COLOR: "1", FORCE_COLOR: "1" }),
      }),
    ).toBe("none");
  });
});

describe("detectFrameEnabled", () => {
  it("requires both a TTY and absence of NO_COLOR", () => {
    expect(detectFrameEnabled({ isTTY: true, env: env() })).toBe(true);
    expect(detectFrameEnabled({ isTTY: false, env: env() })).toBe(false);
    expect(
      detectFrameEnabled({ isTTY: true, env: env({ NO_COLOR: "1" }) }),
    ).toBe(false);
  });

  it("FORCE_COLOR alone does not enable the frame (frame needs cursor control)", () => {
    expect(
      detectFrameEnabled({ isTTY: false, env: env({ FORCE_COLOR: "1" }) }),
    ).toBe(false);
  });
});

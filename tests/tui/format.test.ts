import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatPersonaLabel,
  icons,
} from "../../src/tui/format";

describe("formatDuration", () => {
  it("renders seconds-only as 0:SS with zero pad", () => {
    expect(formatDuration(42_000)).toBe("0:42");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(7_000)).toBe("0:07");
  });

  it("rolls past 60s into M:SS", () => {
    expect(formatDuration(68_000)).toBe("1:08");
    expect(formatDuration(125_000)).toBe("2:05");
  });

  it("crosses an hour into H:MM:SS", () => {
    expect(formatDuration(3_600_000)).toBe("1:00:00");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
  });

  it("clamps negative durations to 0:00", () => {
    expect(formatDuration(-500)).toBe("0:00");
  });

  it("floors fractional milliseconds", () => {
    expect(formatDuration(999)).toBe("0:00");
    expect(formatDuration(1_999)).toBe("0:01");
  });
});

describe("formatBytes", () => {
  it("uses B for under 1024", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(312)).toBe("312 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("uses KB with one decimal for 1024+", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(2_400)).toBe("2.3 KB");
    expect(formatBytes(3_174)).toBe("3.1 KB");
  });

  it("uses MB for 1024^2+", () => {
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });

  it("delta=true prefixes + for non-negative, - for negative", () => {
    expect(formatBytes(312, { delta: true })).toBe("+312 B");
    expect(formatBytes(0, { delta: true })).toBe("+0 B");
    expect(formatBytes(-312, { delta: true })).toBe("-312 B");
  });
});

describe("formatPersonaLabel", () => {
  it("pads short names to width with spaces", () => {
    expect(formatPersonaLabel("ryze", 8)).toBe("ryze    ");
    expect(formatPersonaLabel("zilean", 8)).toBe("zilean  ");
  });

  it("does not truncate names longer than width", () => {
    expect(formatPersonaLabel("twistedfate", 8)).toBe("twistedfate");
  });

  it("default width is 8 for matrix-typical persona names", () => {
    expect(formatPersonaLabel("ryze")).toBe("ryze    ");
  });
});

describe("icons", () => {
  it("returns unicode glyphs by default", () => {
    const i = icons(false);
    expect(i.done).toBe("✓");
    expect(i.active).toBe("⚬");
    expect(i.queued).toBe("·");
    expect(i.failed).toBe("✗");
  });

  it("returns ASCII fallbacks when asciiOnly=true", () => {
    const i = icons(true);
    expect(i.done).toBe("+");
    expect(i.active).toBe("*");
    expect(i.queued).toBe(".");
    expect(i.failed).toBe("x");
  });
});

import { describe, expect, it } from "vitest";
import { captureConsole } from "../../src/util/capture";
import { printHelp } from "../../src/commands/help";

describe("printHelp", () => {
  it("prints a usage block mentioning the loom command", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => printHelp());
    const text = buf.join("\n");
    expect(text).toMatch(/Usage:/);
    expect(text).toMatch(/loom/);
  });

  it("documents the doctor subcommand with smoke flag", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => printHelp());
    expect(buf.join("\n")).toMatch(/doctor.*--smoke/);
  });

  it("documents the 7-phase workflow (loom phase + autopilot)", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => printHelp());
    const text = buf.join("\n");
    expect(text).toMatch(/loom phase/);
    expect(text).toMatch(/loom autopilot/);
    expect(text).toMatch(/--feature/);
    expect(text).toMatch(/discuss.*plan.*build.*review.*verify.*ship.*reflect/);
  });

  it("documents the memory subcommand", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => printHelp());
    expect(buf.join("\n")).toMatch(/loom memory list/);
    expect(buf.join("\n")).toMatch(/loom memory search/);
  });

  it("documents the cron subcommand", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => printHelp());
    expect(buf.join("\n")).toMatch(/loom cron list/);
  });

  it("documents loom chat and the bare-loom TTY behavior", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => printHelp());
    const text = buf.join("\n");
    expect(text).toMatch(/loom chat/);
    expect(text).toMatch(/Chat TUI/);
    expect(text).toMatch(/TTY/);
  });

  it("lists the core chat slash commands", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => printHelp());
    const text = buf.join("\n");
    for (const slash of [
      "/phase",
      "/autopilot",
      "/gate",
      "/personas",
      "/secondary",
      "/synthesize",
      "/open",
      "/status",
      "/help",
      "/quit",
    ]) {
      expect(text).toContain(slash);
    }
  });

  it("does not advertise removed v1 commands", async () => {
    const buf: string[] = [];
    await captureConsole(buf, () => printHelp());
    const text = buf.join("\n");
    for (const removed of [
      "loom run",
      "loom ask",
      "loom team",
      "loom shell",
      "loom tui",
      "loom wrap",
      "loom evolve",
      "loom promote",
      "loom sessions",
      "loom show",
      "loom last",
      "loom clean",
    ]) {
      expect(text).not.toContain(removed);
    }
  });
});

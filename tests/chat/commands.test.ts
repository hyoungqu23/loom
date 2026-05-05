import { describe, expect, it } from "vitest";
import { parseChatInput } from "../../src/chat/commands.js";

describe("chat/commands", () => {
  it("classifies plain natural language separately from slash commands", () => {
    expect(parseChatInput("please build the login form")).toEqual({
      kind: "plain",
      text: "please build the login form",
    });
  });

  it("parses phase commands with optional task text", () => {
    expect(parseChatInput("/phase discuss clarify scope")).toEqual({
      kind: "command",
      command: { type: "phase", phase: "discuss", task: "clarify scope" },
    });
  });

  it("rejects unknown phases", () => {
    expect(parseChatInput("/phase design something")).toEqual({
      kind: "error",
      message: "unknown phase: design",
    });
  });

  it("parses autopilot and gate commands", () => {
    expect(parseChatInput("/autopilot ship the fix")).toEqual({
      kind: "command",
      command: {
        type: "autopilot",
        task: "ship the fix",
        startPhase: undefined,
        endPhase: undefined,
      },
    });
    expect(parseChatInput("/gate revise tighten tests")).toEqual({
      kind: "command",
      command: {
        type: "gate",
        decision: "revise",
        phase: undefined,
        note: "tighten tests",
      },
    });
  });

  it("treats a known phase token as an explicit gate phase override", () => {
    expect(parseChatInput("/gate proceed plan")).toEqual({
      kind: "command",
      command: {
        type: "gate",
        decision: "proceed",
        phase: "plan",
        note: "",
      },
    });
    expect(parseChatInput("/gate revise plan tighten tests")).toEqual({
      kind: "command",
      command: {
        type: "gate",
        decision: "revise",
        phase: "plan",
        note: "tighten tests",
      },
    });
  });

  it("parses /autopilot --start <phase> --end <phase> with the rest as task", () => {
    expect(
      parseChatInput("/autopilot --start build --end review push the fix"),
    ).toEqual({
      kind: "command",
      command: {
        type: "autopilot",
        task: "push the fix",
        startPhase: "build",
        endPhase: "review",
      },
    });
  });

  it("rejects unknown phase values on /autopilot --start / --end", () => {
    const result = parseChatInput("/autopilot --start design ship");
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("--start requires a phase");
    }
  });

  it("does not consume the second token as a phase when it is not a phase name", () => {
    expect(parseChatInput("/gate revise design tweak")).toEqual({
      kind: "command",
      command: {
        type: "gate",
        decision: "revise",
        phase: undefined,
        note: "design tweak",
      },
    });
  });

  it("parses option commands for future runs", () => {
    expect(parseChatInput("/personas ryze,zilean")).toEqual({
      kind: "command",
      command: { type: "personas", personas: ["ryze", "zilean"] },
    });
    // Both spellings clear the override list.
    expect(parseChatInput("/personas")).toEqual({
      kind: "command",
      command: { type: "personas", personas: [] },
    });
    expect(parseChatInput("/personas reset")).toEqual({
      kind: "command",
      command: { type: "personas", personas: [] },
    });
    expect(parseChatInput("/secondary on")).toEqual({
      kind: "command",
      command: { type: "secondary", enabled: true },
    });
    expect(parseChatInput("/synthesize off")).toEqual({
      kind: "command",
      command: { type: "synthesize", enabled: false },
    });
  });

  it("parses status, open, help, and quit commands", () => {
    expect(parseChatInput("/status")).toEqual({
      kind: "command",
      command: { type: "status" },
    });
    expect(parseChatInput("/open synthesis")).toEqual({
      kind: "command",
      command: { type: "open", target: "synthesis" },
    });
    expect(parseChatInput("/help")).toEqual({
      kind: "command",
      command: { type: "help" },
    });
    expect(parseChatInput("/quit")).toEqual({
      kind: "command",
      command: { type: "quit" },
    });
  });

  it("returns structured errors for malformed commands", () => {
    expect(parseChatInput("/secondary maybe")).toEqual({
      kind: "error",
      message: "secondary must be on or off",
    });
    expect(parseChatInput("/wat")).toEqual({
      kind: "error",
      message: "unknown command: wat",
    });
  });
});

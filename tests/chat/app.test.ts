import { describe, expect, it } from "vitest";
import * as React from "react";
import { render } from "ink-testing-library";
import { createInitialChatState } from "../../src/chat/state.js";
import { ChatApp } from "../../src/chat/App.js";

describe("chat/App", () => {
  it("renders the chat workspace header, transcript, detail, and footer", () => {
    const state = createInitialChatState({
      sessionDir: "/tmp/session",
      feature: "alpha",
      currentPhase: "build",
      hasContext: true,
      hasPlan: false,
    });

    const { lastFrame } = render(
      React.createElement(ChatApp, {
        state,
        messages: [
          { type: "user", text: "/phase build implement login" },
          { type: "run-start", text: "phase started: build" },
        ],
        detail: "Synthesis pending",
        input: "/status",
      }),
    );

    const frame = lastFrame() || "";
    expect(frame).toContain("loom chat");
    expect(frame).toContain("feature=alpha");
    expect(frame).toContain("phase=build");
    expect(frame).toContain("/phase build implement login");
    expect(frame).toContain("phase started: build");
    expect(frame).toContain("Synthesis pending");
    expect(frame).toContain("> /status");
  });

  it("shows gate waiting state in the header", () => {
    const state = {
      ...createInitialChatState({
        sessionDir: "/tmp/session",
        feature: "alpha",
        currentPhase: "plan",
      }),
      run: { status: "waiting-for-gate" as const, phase: "plan" as const },
    };

    const { lastFrame } = render(
      React.createElement(ChatApp, {
        state,
        messages: [],
        detail: "",
        input: "",
      }),
    );

    expect(lastFrame()).toContain("gate=waiting plan");
  });

  it("renders worker and synthesis progress transcript entries", () => {
    const state = createInitialChatState({
      sessionDir: "/tmp/session",
      feature: "alpha",
      currentPhase: "build",
    });

    const { lastFrame } = render(
      React.createElement(ChatApp, {
        state,
        messages: [
          { type: "system", text: "worker started: viktor" },
          { type: "system", text: "worker finished: viktor status=0" },
          { type: "system", text: "synthesis started: twistedfate" },
        ],
        detail: "",
        input: "",
      }),
    );

    const frame = lastFrame() || "";
    expect(frame).toContain("worker started: viktor");
    expect(frame).toContain("worker finished: viktor status=0");
    expect(frame).toContain("synthesis started: twistedfate");
  });
});

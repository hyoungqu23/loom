import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { render } from "ink-testing-library";
import {
  dispatchChatKey,
  InteractiveChat,
} from "../../src/chat/Interactive.js";
import { createInitialChatState } from "../../src/chat/state.js";

function makeDeps() {
  return {
    busy: false,
    appendNotice: vi.fn(),
    removeLastChar: vi.fn(),
    appendChar: vi.fn(),
    submit: vi.fn(),
    exit: vi.fn(),
  };
}

describe("dispatchChatKey", () => {
  it("appends printable characters to the input buffer", () => {
    const deps = makeDeps();
    dispatchChatKey({ char: "a" }, deps);
    expect(deps.appendChar).toHaveBeenCalledWith("a");
  });

  it("ignores meta-modified keystrokes", () => {
    const deps = makeDeps();
    dispatchChatKey({ char: "a", meta: true }, deps);
    expect(deps.appendChar).not.toHaveBeenCalled();
  });

  it("removes the last char on backspace and on delete", () => {
    const deps = makeDeps();
    dispatchChatKey({ char: "", backspace: true }, deps);
    dispatchChatKey({ char: "", delete: true }, deps);
    expect(deps.removeLastChar).toHaveBeenCalledTimes(2);
  });

  it("submits on return", () => {
    const deps = makeDeps();
    dispatchChatKey({ char: "", return: true }, deps);
    expect(deps.submit).toHaveBeenCalledTimes(1);
  });

  it("exits on Ctrl+C while idle", () => {
    const deps = makeDeps();
    dispatchChatKey({ char: "c", ctrl: true }, deps);
    expect(deps.exit).toHaveBeenCalledTimes(1);
    expect(deps.appendNotice).not.toHaveBeenCalled();
  });

  it("posts a cancel notice on Ctrl+C while busy and does not exit", () => {
    const deps = makeDeps();
    deps.busy = true;
    dispatchChatKey({ char: "c", ctrl: true }, deps);
    expect(deps.exit).not.toHaveBeenCalled();
    expect(deps.appendNotice).toHaveBeenCalledWith(
      "cancel requested; current run will continue to completion",
    );
  });

  it("drops normal keystrokes while busy so input cannot accumulate", () => {
    const deps = makeDeps();
    deps.busy = true;
    dispatchChatKey({ char: "z" }, deps);
    dispatchChatKey({ char: "", return: true }, deps);
    dispatchChatKey({ char: "", backspace: true }, deps);
    expect(deps.appendChar).not.toHaveBeenCalled();
    expect(deps.submit).not.toHaveBeenCalled();
    expect(deps.removeLastChar).not.toHaveBeenCalled();
  });

  it("recognises Ctrl+C as the bare ETX byte too", () => {
    const deps = makeDeps();
    dispatchChatKey({ char: "", ctrl: true }, deps);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });
});

describe("InteractiveChat render", () => {
  it("renders the chat workspace with initial transcript and empty input line", () => {
    const initialState = createInitialChatState({
      sessionDir: "/tmp/session",
      feature: "alpha",
      currentPhase: "discuss",
    });
    const { lastFrame } = render(
      React.createElement(InteractiveChat, {
        initialState,
        initialTranscript: [
          { type: "system", text: "session opened: alpha" },
        ],
        handleInput: vi.fn(),
        onExit: vi.fn(),
      }),
    );

    const frame = lastFrame() || "";
    expect(frame).toContain("loom chat");
    expect(frame).toContain("feature=alpha");
    expect(frame).toContain("session opened: alpha");
    expect(frame).toMatch(/> ?$/m);
    expect(frame).toContain(
      "Synthesis will appear here after a phase run.",
    );
  });

  it("falls back to state.detail once it has been populated", () => {
    const initialState = {
      ...createInitialChatState({
        sessionDir: "/tmp/session",
        feature: "alpha",
        currentPhase: "plan",
      }),
      detail: "# synthesis — plan\n\nactually populated",
    };
    const { lastFrame } = render(
      React.createElement(InteractiveChat, {
        initialState,
        initialTranscript: [],
        handleInput: vi.fn(),
        onExit: vi.fn(),
      }),
    );

    const frame = lastFrame() || "";
    expect(frame).toContain("actually populated");
    expect(frame).not.toContain(
      "Synthesis will appear here after a phase run.",
    );
  });
});

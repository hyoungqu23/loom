import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { render } from "ink-testing-library";
import {
  chatUIReducer,
  dispatchChatKey,
  InteractiveChat,
  type ChatUIState,
} from "../../src/chat/Interactive.js";
import { createInitialChatState } from "../../src/chat/state.js";

function makeDeps() {
  return {
    busy: false,
    cancelRequested: false,
    appendNotice: vi.fn(),
    markCancelRequested: vi.fn(),
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

  it("posts a cancel notice on the first Ctrl+C while busy, does not exit, and marks the request", () => {
    const deps = makeDeps();
    deps.busy = true;
    dispatchChatKey({ char: "c", ctrl: true }, deps);
    expect(deps.exit).not.toHaveBeenCalled();
    expect(deps.appendNotice).toHaveBeenCalledTimes(1);
    expect(deps.appendNotice.mock.calls[0][0]).toContain("cancel requested");
    expect(deps.appendNotice.mock.calls[0][0]).toContain(
      "Press Ctrl+C again",
    );
    expect(deps.markCancelRequested).toHaveBeenCalledTimes(1);
  });

  it("force-exits on the second Ctrl+C while still busy", () => {
    const deps = makeDeps();
    deps.busy = true;
    deps.cancelRequested = true;
    dispatchChatKey({ char: "c", ctrl: true }, deps);
    expect(deps.exit).toHaveBeenCalledTimes(1);
    expect(deps.appendNotice).not.toHaveBeenCalled();
    expect(deps.markCancelRequested).not.toHaveBeenCalled();
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

describe("chatUIReducer", () => {
  function seed(): ChatUIState {
    return {
      snapshot: {
        state: createInitialChatState({
          sessionDir: "/tmp/x",
          feature: "x",
          currentPhase: "discuss",
        }),
        transcript: [],
        detail: "",
      },
      input: "",
      busy: false,
      cancelRequested: false,
    };
  }

  it("input/append accumulates characters", () => {
    let s = seed();
    s = chatUIReducer(s, { type: "input/append", char: "/" });
    s = chatUIReducer(s, { type: "input/append", char: "s" });
    expect(s.input).toBe("/s");
  });

  it("input/backspace drops the last char and stops at empty", () => {
    let s = { ...seed(), input: "ab" };
    s = chatUIReducer(s, { type: "input/backspace" });
    expect(s.input).toBe("a");
    s = chatUIReducer(s, { type: "input/backspace" });
    s = chatUIReducer(s, { type: "input/backspace" });
    expect(s.input).toBe("");
  });

  it("input/clear empties the buffer regardless of content", () => {
    const s = chatUIReducer(
      { ...seed(), input: "/status" },
      { type: "input/clear" },
    );
    expect(s.input).toBe("");
  });

  it("transcript/append adds an entry to snapshot.transcript", () => {
    const s = chatUIReducer(seed(), {
      type: "transcript/append",
      entry: { type: "system", text: "hi" },
    });
    expect(s.snapshot.transcript).toEqual([{ type: "system", text: "hi" }]);
  });

  it("transcript/replace swaps snapshot.transcript (used by live progress)", () => {
    const base = seed();
    const s = chatUIReducer(
      {
        ...base,
        snapshot: {
          ...base.snapshot,
          transcript: [{ type: "user", text: "old" }],
        },
      },
      {
        type: "transcript/replace",
        transcript: [{ type: "system", text: "new" }],
      },
    );
    expect(s.snapshot.transcript).toEqual([{ type: "system", text: "new" }]);
  });

  it("submit/start flips busy on; submit/finish swaps the whole snapshot atomically", () => {
    let s = seed();
    s = chatUIReducer(s, { type: "submit/start" });
    expect(s.busy).toBe(true);

    const nextSnapshot = {
      state: { ...s.snapshot.state, currentPhase: "plan" as const },
      transcript: [{ type: "system" as const, text: "done" }],
      detail: "# synthesis — plan",
    };
    s = chatUIReducer(s, { type: "submit/finish", snapshot: nextSnapshot });
    expect(s.busy).toBe(false);
    expect(s.snapshot).toBe(nextSnapshot);
  });

  it("cancel/request raises the flag and submit/start clears it for a new run", () => {
    let s = chatUIReducer(seed(), { type: "cancel/request" });
    expect(s.cancelRequested).toBe(true);
    s = chatUIReducer(s, { type: "submit/start" });
    expect(s.cancelRequested).toBe(false);
  });

  it("submit/finish and submit/error both clear cancelRequested", () => {
    let s = chatUIReducer(seed(), { type: "submit/start" });
    s = chatUIReducer(s, { type: "cancel/request" });
    expect(s.cancelRequested).toBe(true);
    s = chatUIReducer(s, {
      type: "submit/finish",
      snapshot: { ...s.snapshot, transcript: [] },
    });
    expect(s.cancelRequested).toBe(false);

    let t = chatUIReducer(seed(), { type: "submit/start" });
    t = chatUIReducer(t, { type: "cancel/request" });
    t = chatUIReducer(t, {
      type: "submit/error",
      entry: { type: "error", text: "boom" },
    });
    expect(t.cancelRequested).toBe(false);
  });

  it("submit/error clears busy and appends the error entry to snapshot.transcript", () => {
    let s = chatUIReducer(seed(), { type: "submit/start" });
    s = chatUIReducer(s, {
      type: "submit/error",
      entry: { type: "error", text: "chat error: boom" },
    });
    expect(s.busy).toBe(false);
    const transcript = s.snapshot.transcript;
    expect(transcript[transcript.length - 1]).toEqual({
      type: "error",
      text: "chat error: boom",
    });
  });
});

describe("InteractiveChat render", () => {
  it("renders the chat workspace with initial transcript and empty input line", () => {
    const initialSnapshot = {
      state: createInitialChatState({
        sessionDir: "/tmp/session",
        feature: "alpha",
        currentPhase: "discuss" as const,
      }),
      transcript: [{ type: "system" as const, text: "session opened: alpha" }],
      detail: "",
    };
    const { lastFrame } = render(
      React.createElement(InteractiveChat, {
        initialSnapshot,
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

  it("falls back to snapshot.detail once it has been populated", () => {
    const initialSnapshot = {
      state: createInitialChatState({
        sessionDir: "/tmp/session",
        feature: "alpha",
        currentPhase: "plan" as const,
      }),
      transcript: [],
      detail: "# synthesis — plan\n\nactually populated",
    };
    const { lastFrame } = render(
      React.createElement(InteractiveChat, {
        initialSnapshot,
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

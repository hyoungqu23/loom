import { describe, expect, it } from "vitest";
import {
  createInitialChatState,
  chatReducer,
  renderChatStatus,
} from "../../src/chat/state";

describe("chat/state", () => {
  it("starts with primary-personas-only and synthesis enabled", () => {
    const state = createInitialChatState({
      sessionDir: "/tmp/session",
      feature: "alpha",
      currentPhase: "discuss",
    });

    expect(state.feature).toBe("alpha");
    expect(state.currentPhase).toBe("discuss");
    expect(state.options).toEqual({
      personas: [],
      includeSecondary: false,
      synthesize: true,
    });
    expect(state.run.status).toBe("idle");
  });

  it("tracks option changes for future runs", () => {
    let state = createInitialChatState({
      sessionDir: "/tmp/session",
      feature: "alpha",
      currentPhase: "discuss",
    });

    state = chatReducer(state, { type: "set-secondary", enabled: true });
    state = chatReducer(state, { type: "set-synthesize", enabled: false });
    state = chatReducer(state, { type: "set-personas", personas: ["zilean"] });

    expect(state.options).toEqual({
      personas: ["zilean"],
      includeSecondary: true,
      synthesize: false,
    });
  });

  it("records run and gate-waiting states", () => {
    let state = createInitialChatState({
      sessionDir: "/tmp/session",
      feature: "alpha",
      currentPhase: "discuss",
    });

    state = chatReducer(state, { type: "run-start", phase: "plan" });
    expect(state.run).toEqual({ status: "running", phase: "plan" });

    state = chatReducer(state, { type: "gate-wait", phase: "plan" });
    expect(state.run).toEqual({ status: "waiting-for-gate", phase: "plan" });

    state = chatReducer(state, { type: "run-finish", phase: "plan" });
    expect(state.currentPhase).toBe("plan");
    expect(state.run).toEqual({ status: "idle" });
  });

  it("renders status from a single state snapshot", () => {
    const state = chatReducer(
      createInitialChatState({
        sessionDir: "/tmp/session",
        feature: "alpha",
        currentPhase: "build",
        hasContext: true,
        hasPlan: false,
      }),
      { type: "set-secondary", enabled: true },
    );

    expect(renderChatStatus(state)).toContain("feature=alpha");
    expect(renderChatStatus(state)).toContain("phase=build");
    expect(renderChatStatus(state)).toContain("context=yes");
    expect(renderChatStatus(state)).toContain("plan=no");
    expect(renderChatStatus(state)).toContain("secondary=on");
    expect(renderChatStatus(state)).toContain("synthesize=on");
  });
});

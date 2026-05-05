import { describe, expect, it, vi } from "vitest";
import {
  ChatPhaseProgress,
  createProgressEmitter,
} from "../../src/chat/phaseAdapter.js";

describe("createProgressEmitter", () => {
  it("passes everything through when throttleMs is 0", () => {
    const emit = vi.fn();
    const wrapped = createProgressEmitter(emit, 0);
    const evt: ChatPhaseProgress = {
      type: "worker-progress",
      persona: "ryze",
      stream: "stdout",
      bytes: 4,
    };
    wrapped(evt);
    wrapped(evt);
    wrapped(evt);
    expect(emit).toHaveBeenCalledTimes(3);
  });

  it("drops worker-progress events that land within the throttle window", () => {
    let now = 1_000;
    const emit = vi.fn();
    const wrapped = createProgressEmitter(emit, 100, () => now);

    wrapped({ type: "worker-progress", persona: "ryze", stream: "stdout", bytes: 1 });
    now = 1_050; // < 100ms
    wrapped({ type: "worker-progress", persona: "ryze", stream: "stdout", bytes: 2 });
    now = 1_080; // still < 100ms from the last *emitted* event
    wrapped({ type: "worker-progress", persona: "ryze", stream: "stdout", bytes: 3 });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].bytes).toBe(1);
  });

  it("emits again once the throttle window passes", () => {
    let now = 1_000;
    const emit = vi.fn();
    const wrapped = createProgressEmitter(emit, 100, () => now);

    wrapped({ type: "worker-progress", persona: "ryze", stream: "stdout", bytes: 1 });
    now = 1_120;
    wrapped({ type: "worker-progress", persona: "ryze", stream: "stdout", bytes: 2 });
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("throttles per persona independently", () => {
    let now = 1_000;
    const emit = vi.fn();
    const wrapped = createProgressEmitter(emit, 100, () => now);

    wrapped({ type: "worker-progress", persona: "ryze", stream: "stdout", bytes: 1 });
    wrapped({ type: "worker-progress", persona: "zilean", stream: "stdout", bytes: 1 });
    now = 1_010;
    wrapped({ type: "worker-progress", persona: "ryze", stream: "stdout", bytes: 2 }); // dropped
    wrapped({ type: "worker-progress", persona: "zilean", stream: "stdout", bytes: 2 }); // dropped

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls.map((c) => c[0].persona)).toEqual(["ryze", "zilean"]);
  });

  it("never throttles lifecycle events (worker-start / worker-done / synthesis-start)", () => {
    let now = 1_000;
    const emit = vi.fn();
    const wrapped = createProgressEmitter(emit, 100, () => now);

    wrapped({ type: "worker-start", persona: "ryze" });
    wrapped({ type: "worker-progress", persona: "ryze", stream: "stdout", bytes: 1 });
    now = 1_010;
    wrapped({ type: "worker-progress", persona: "ryze", stream: "stdout", bytes: 2 }); // dropped
    wrapped({ type: "synthesis-start", persona: "twistedfate" });
    wrapped({ type: "worker-done", persona: "ryze", status: 0 });

    const types = emit.mock.calls.map((c) => c[0].type);
    expect(types).toEqual([
      "worker-start",
      "worker-progress",
      "synthesis-start",
      "worker-done",
    ]);
  });
});

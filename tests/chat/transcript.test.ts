import { describe, expect, it } from "vitest";
import {
  appendParsedInputToTranscript,
  appendRuntimeMessagesToTranscript,
  clampTranscript,
  createTranscript,
  Transcript,
} from "../../src/chat/transcript.js";
import { TRANSCRIPT_MAX } from "../../src/chat/constants.js";

describe("chat/transcript", () => {
  it("appends plain user input as a user transcript message", () => {
    const transcript = appendParsedInputToTranscript(createTranscript(), {
      kind: "plain",
      text: "please clarify the scope",
    });

    expect(transcript).toEqual([
      { type: "user", text: "please clarify the scope" },
    ]);
  });

  it("appends slash commands as user transcript messages", () => {
    const transcript = appendParsedInputToTranscript(createTranscript(), {
      kind: "command",
      command: { type: "status" },
    });

    expect(transcript).toEqual([{ type: "user", text: "/status" }]);
  });

  it("appends parser errors as error transcript messages", () => {
    const transcript = appendParsedInputToTranscript(createTranscript(), {
      kind: "error",
      message: "unknown command: wat",
    });

    expect(transcript).toEqual([
      { type: "error", text: "unknown command: wat" },
    ]);
  });

  it("appends runtime lifecycle messages as system transcript messages", () => {
    const transcript = appendRuntimeMessagesToTranscript(createTranscript(), [
      { type: "run-start", text: "phase started: build" },
      { type: "worker-start", text: "worker started: viktor" },
      { type: "worker-done", text: "worker finished: viktor status=0" },
      { type: "synthesis-start", text: "synthesis started: twistedfate" },
      { type: "run-finish", text: "phase finished: build workers=1" },
    ]);

    expect(transcript).toEqual([
      { type: "system", text: "phase started: build" },
      { type: "system", text: "worker started: viktor" },
      { type: "system", text: "worker finished: viktor status=0" },
      { type: "system", text: "synthesis started: twistedfate" },
      { type: "system", text: "phase finished: build workers=1" },
    ]);
  });

  it("represents gate waiting distinctly from idle messages", () => {
    const transcript = appendRuntimeMessagesToTranscript(createTranscript(), [
      { type: "gate-wait", text: "waiting for gate: plan" },
    ]);

    expect(transcript).toEqual([
      { type: "gate", text: "waiting for gate: plan" },
    ]);
  });
});

describe("clampTranscript", () => {
  it("returns the same array reference under the cap", () => {
    const transcript: Transcript = [
      { type: "user", text: "hi" },
      { type: "system", text: "ok" },
    ];
    expect(clampTranscript(transcript)).toBe(transcript);
  });

  it("drops oldest entries past TRANSCRIPT_MAX", () => {
    const transcript: Transcript = Array.from(
      { length: TRANSCRIPT_MAX + 5 },
      (_, i) => ({ type: "system" as const, text: `msg ${i}` }),
    );

    const clamped = clampTranscript(transcript);

    expect(clamped).toHaveLength(TRANSCRIPT_MAX);
    expect(clamped[0]).toEqual({ type: "system", text: "msg 5" });
    expect(clamped[clamped.length - 1]).toEqual({
      type: "system",
      text: `msg ${TRANSCRIPT_MAX + 4}`,
    });
  });

  it("appendRuntimeMessagesToTranscript respects the cap as new messages arrive", () => {
    const initial: Transcript = Array.from(
      { length: TRANSCRIPT_MAX },
      (_, i) => ({ type: "system" as const, text: `m${i}` }),
    );
    const out = appendRuntimeMessagesToTranscript(initial, [
      { type: "run-finish", text: "phase finished: discuss workers=1" },
    ]);
    expect(out).toHaveLength(TRANSCRIPT_MAX);
    expect(out[out.length - 1]).toEqual({
      type: "system",
      text: "phase finished: discuss workers=1",
    });
    // Oldest must have been dropped to make room.
    expect(out[0]).toEqual({ type: "system", text: "m1" });
  });
});

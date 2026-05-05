import { describe, expect, it } from "vitest";
import {
  appendParsedInputToTranscript,
  appendRuntimeMessagesToTranscript,
  createTranscript,
} from "../../src/chat/transcript";

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

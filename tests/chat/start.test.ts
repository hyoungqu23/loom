import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { startChat } from "../../src/chat/start.js";
import { createPhaseSession } from "../../src/phases/session.js";
import { getActiveWorkspace, setActiveWorkspace } from "../../src/workspace.js";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-chat-start-"));
  setActiveWorkspace(tmp);
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("chat/start", () => {
  it("resolves a session and renders the Chat App through injected Ink modules", async () => {
    createPhaseSession("alpha");
    const render = vi.fn();

    await startChat({
      feature: "alpha",
      loadInk: async () => ({
        createElement: (type: unknown, props: unknown) => ({ type, props }),
        render,
      }),
    });

    expect(render).toHaveBeenCalledTimes(1);
    const [element] = render.mock.calls[0];
    expect(element.props.initialSnapshot.state.feature).toBe("alpha");
    expect(element.props.initialSnapshot.transcript[0]).toEqual({
      type: "system",
      text: "session opened: alpha",
    });
    expect(element.props.initialSnapshot.detail).toBe("");
  });

  it("hydrates context and plan flags when opening an existing session", async () => {
    const sessionDir = createPhaseSession("hydrated");
    fs.writeFileSync(path.join(sessionDir, "CONTEXT.md"), "# Context\n");
    fs.writeFileSync(path.join(sessionDir, "PLAN.md"), "# Plan\n");
    const render = vi.fn();

    await startChat({
      feature: "hydrated",
      loadInk: async () => ({
        createElement: (type: unknown, props: unknown) => ({ type, props }),
        render,
      }),
    });

    const [element] = render.mock.calls[0];
    expect(element.props.initialSnapshot.state.hasContext).toBe(true);
    expect(element.props.initialSnapshot.state.hasPlan).toBe(true);
  });

  it("creates a missing explicit session before rendering", async () => {
    const render = vi.fn();

    await startChat({
      feature: "new feature",
      loadInk: async () => ({
        createElement: (type: unknown, props: unknown) => ({ type, props }),
        render,
      }),
    });

    const [element] = render.mock.calls[0];
    expect(element.props.initialSnapshot.state.feature).toBe("new-feature");
    expect(element.props.initialSnapshot.transcript[0].text).toBe(
      "session created: new-feature",
    );
  });
});

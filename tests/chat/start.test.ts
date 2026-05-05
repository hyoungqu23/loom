import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { startChat } from "../../src/chat/start";
import { createPhaseSession } from "../../src/phases/session";
import { getActiveWorkspace, setActiveWorkspace } from "../../src/workspace";

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
        React: {
          createElement: (type: unknown, props: unknown) => ({ type, props }),
        },
        render,
        Box: "Box",
        Text: "Text",
      }),
    });

    expect(render).toHaveBeenCalledTimes(1);
    const [element] = render.mock.calls[0];
    expect(element.props.state.feature).toBe("alpha");
    expect(element.props.messages[0]).toEqual({
      type: "system",
      text: "session opened: alpha",
    });
  });

  it("creates a missing explicit session before rendering", async () => {
    const render = vi.fn();

    await startChat({
      feature: "new feature",
      loadInk: async () => ({
        React: {
          createElement: (type: unknown, props: unknown) => ({ type, props }),
        },
        render,
        Box: "Box",
        Text: "Text",
      }),
    });

    const [element] = render.mock.calls[0];
    expect(element.props.state.feature).toBe("new-feature");
    expect(element.props.messages[0].text).toBe("session created: new-feature");
  });
});

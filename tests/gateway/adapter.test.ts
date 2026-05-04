import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleGatewayMessage } from "../../src/gateway/adapter";
import {
  ensureWorkspaceState,
  getActiveWorkspace,
  setActiveWorkspace,
} from "../../src/workspace";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-gateway-"));
  setActiveWorkspace(tmp);
  ensureWorkspaceState();
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("handleGatewayMessage", () => {
  it("maps gateway input to command output without platform-specific code", async () => {
    const result = await handleGatewayMessage({
      text: "loom memory list",
      sender: "u1",
      channel: "telegram",
      threadId: "t1",
      attachments: [],
    });

    expect(result.status).toBe("ok");
    expect(result.text).toContain("Memory Candidates");
    expect(result.files).toEqual([]);
    expect(result.nextAction).toBe("none");
  });

  it("returns an error response for unknown commands", async () => {
    const result = await handleGatewayMessage({
      text: "loom nope",
      sender: "u1",
      channel: "slack",
      threadId: "t1",
      attachments: [],
    });

    expect(result.status).toBe("error");
    expect(result.text).toContain("not allowed from gateway");
  });

  it("requires human approval for mutating commands", async () => {
    const result = await handleGatewayMessage({
      text: "loom cron run nightly-qa",
      sender: "u1",
      channel: "slack",
      threadId: "t1",
      attachments: [],
    });

    expect(result.status).toBe("error");
    expect(result.nextAction).toBe("needs-human");
    expect(result.text).toContain("not allowed from gateway");
  });

  it("ignores non-Loom messages with a no-op response", async () => {
    const result = await handleGatewayMessage({
      text: "hello",
      sender: "u1",
      channel: "slack",
      threadId: "t1",
      attachments: [],
    });

    expect(result).toEqual({
      text: "",
      files: [],
      status: "ignored",
      nextAction: "none",
    });
  });
});

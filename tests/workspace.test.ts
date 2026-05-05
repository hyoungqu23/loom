import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultsPath,
  ensureWithinWorkspace,
  ensureWorkspaceState,
  getActiveWorkspace,
  getPackageRoot,
  loomStateRoot,
  packageHarnessPath,
  readPackageHarnessFile,
  setActiveWorkspace,
  workspaceConfigPath,
  workspaceRoot,
} from "../src/workspace.js";

let tmp: string;
let originalWorkspace: string;

beforeEach(() => {
  originalWorkspace = getActiveWorkspace();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loom-ws-test-"));
  setActiveWorkspace(tmp);
});

afterEach(() => {
  setActiveWorkspace(originalWorkspace);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("getPackageRoot", () => {
  it("returns an absolute path that contains a package.json", () => {
    const root = getPackageRoot();
    expect(path.isAbsolute(root)).toBe(true);
    expect(fs.existsSync(path.join(root, "package.json"))).toBe(true);
  });
});

describe("setActiveWorkspace + getActiveWorkspace", () => {
  it("round-trips an absolute path", () => {
    setActiveWorkspace(tmp);
    expect(getActiveWorkspace()).toBe(path.resolve(tmp));
  });

  it("resolves a relative path against process.cwd()", () => {
    setActiveWorkspace(".");
    expect(getActiveWorkspace()).toBe(path.resolve("."));
  });
});

describe("workspaceRoot", () => {
  it("returns the active workspace, resolved", () => {
    expect(workspaceRoot()).toBe(path.resolve(tmp));
  });
});

describe("loomStateRoot", () => {
  it("returns <workspace>/.loom", () => {
    expect(loomStateRoot()).toBe(path.join(path.resolve(tmp), ".loom"));
  });
});

describe("workspaceConfigPath", () => {
  it("returns <workspace>/.loom/config.json", () => {
    expect(workspaceConfigPath()).toBe(
      path.join(path.resolve(tmp), ".loom", "config.json"),
    );
  });
});

describe("ensureWorkspaceState", () => {
  it("creates the v2 state directory layout", () => {
    const root = ensureWorkspaceState();
    expect(root).toBe(path.join(path.resolve(tmp), ".loom"));
    expect(fs.existsSync(path.join(root, "features"))).toBe(true);
    expect(fs.existsSync(path.join(root, "runtime-runs"))).toBe(true);
  });

  it("does not create v1 directories (sessions/logs/memory/harness)", () => {
    const root = ensureWorkspaceState();
    expect(fs.existsSync(path.join(root, "sessions"))).toBe(false);
    expect(fs.existsSync(path.join(root, "logs"))).toBe(false);
    expect(fs.existsSync(path.join(root, "memory"))).toBe(false);
    expect(fs.existsSync(path.join(root, "harness"))).toBe(false);
  });

  it("is idempotent (safe to call repeatedly)", () => {
    expect(() => {
      ensureWorkspaceState();
      ensureWorkspaceState();
    }).not.toThrow();
  });
});

describe("packageHarnessPath", () => {
  it("joins parts under <packageRoot>/harness", () => {
    const p = packageHarnessPath("agents", "kayle.md");
    expect(p).toBe(path.join(getPackageRoot(), "harness", "agents", "kayle.md"));
  });
});

describe("readPackageHarnessFile", () => {
  it("returns the file contents when the file exists", () => {
    // Create a fake harness file under the package root for the test.
    const target = packageHarnessPath("__test__.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "hello");
    try {
      expect(readPackageHarnessFile("__test__.md")).toBe("hello");
    } finally {
      fs.rmSync(target, { force: true });
    }
  });

  it("returns empty string when the file is missing", () => {
    expect(readPackageHarnessFile("does-not-exist.md")).toBe("");
  });
});

describe("defaultsPath", () => {
  it("returns <packageRoot>/config/defaults.json", () => {
    expect(defaultsPath()).toBe(
      path.join(getPackageRoot(), "config", "defaults.json"),
    );
  });
});

describe("ensureWithinWorkspace", () => {
  it("returns the resolved absolute path for a child of workspace", () => {
    const inside = path.join(tmp, "child", "leaf.txt");
    expect(ensureWithinWorkspace(inside)).toBe(path.resolve(inside));
  });

  it("returns the workspace root itself", () => {
    expect(ensureWithinWorkspace(tmp)).toBe(path.resolve(tmp));
  });

  it("throws for a path outside the workspace", () => {
    expect(() =>
      ensureWithinWorkspace("/etc/passwd", "--target"),
    ).toThrow(/--target.*escapes workspace/);
  });

  it("rejects paths that look like a child by prefix only (no separator)", () => {
    // `${workspace}-evil` shares the prefix but is NOT a child.
    expect(() => ensureWithinWorkspace(`${tmp}-evil`, "--from")).toThrow(
      /--from.*escapes workspace/,
    );
  });

  it("allows the package root when option is set", () => {
    const inside = path.join(getPackageRoot(), "src", "cli.ts");
    expect(
      ensureWithinWorkspace(inside, "path", { allowPackageRoot: true }),
    ).toBe(path.resolve(inside));
  });

  it("rejects the package root when option is NOT set", () => {
    const inside = path.join(getPackageRoot(), "src", "cli.ts");
    expect(() => ensureWithinWorkspace(inside, "path")).toThrow(
      /escapes workspace/,
    );
  });
});

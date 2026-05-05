import { describe, expect, it } from "vitest";
import { runSpec } from "../../src/engine/spawn.js";
import { RuntimeSpec, WorkerStream } from "../../src/types.js";

const nodeSpec = (script: string, stdin?: string): RuntimeSpec => ({
  command: "node",
  args: ["-e", script],
  cwd: process.cwd(),
  stdin,
});

describe("runSpec", () => {
  it("captures stdout and returns status=0 for a successful run", async () => {
    const result = await runSpec(
      nodeSpec("process.stdout.write('hello')"),
      5000,
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("hello");
    expect(result.stderr).toBe("");
    expect(result.error).toBeNull();
  });

  it("captures stderr separately from stdout", async () => {
    const result = await runSpec(
      nodeSpec("process.stderr.write('warn'); process.stdout.write('out')"),
      5000,
    );
    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("warn");
  });

  it("propagates non-zero exit codes", async () => {
    const result = await runSpec(nodeSpec("process.exit(2)"), 5000);
    expect(result.status).toBe(2);
  });

  it("forwards stdin to the child process", async () => {
    const script =
      "let buf=''; process.stdin.on('data',d=>buf+=d); process.stdin.on('end',()=>process.stdout.write('ECHO:'+buf));";
    const result = await runSpec(nodeSpec(script, "fed-in"), 5000);
    expect(result.stdout).toBe("ECHO:fed-in");
  });

  it("invokes onData hook for stdout chunks", async () => {
    const seen: Array<[WorkerStream, string]> = [];
    await runSpec(
      nodeSpec("process.stdout.write('chunk')"),
      5000,
      { onData: (stream, text) => seen.push([stream, text]) },
    );
    expect(seen.find((s) => s[0] === "stdout" && s[1] === "chunk")).toBeDefined();
  });

  it("invokes onData hook for stderr chunks", async () => {
    const seen: Array<[WorkerStream, string]> = [];
    await runSpec(
      nodeSpec("process.stderr.write('err-chunk')"),
      5000,
      { onData: (stream, text) => seen.push([stream, text]) },
    );
    expect(seen.find((s) => s[0] === "stderr" && s[1] === "err-chunk"))
      .toBeDefined();
  });

  it("captures spawn errors when command is missing", async () => {
    const result = await runSpec(
      {
        command: "loom-totally-fake-binary-xyz-12345",
        args: [],
        cwd: process.cwd(),
      },
      5000,
    );
    expect(result.error).not.toBeNull();
    expect(result.stderr).toContain("ENOENT");
  });

  it("kills the child after timeout and surfaces a timeout marker in stderr", async () => {
    const result = await runSpec(
      nodeSpec("setInterval(()=>{},1000)"), // hangs forever
      150,
    );
    // Child was killed by SIGTERM (or SIGKILL after grace).
    expect(result.signal).not.toBeNull();
    expect(result.stderr).toMatch(/timed out after 150ms/);
  });
});

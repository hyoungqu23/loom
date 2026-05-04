import { RuntimeName } from "../types";

export type RuntimeCapability = {
  runtime: RuntimeName;
  tools: boolean;
  streaming: boolean;
  approvals: boolean;
  cwd: boolean;
  env: boolean;
};

const CAPABILITIES: { [runtime: string]: RuntimeCapability } = {
  codex: {
    runtime: "codex",
    tools: true,
    streaming: true,
    approvals: true,
    cwd: true,
    env: true,
  },
  claude: {
    runtime: "claude",
    tools: true,
    streaming: true,
    approvals: false,
    cwd: true,
    env: true,
  },
  gemini: {
    runtime: "gemini",
    tools: true,
    streaming: true,
    approvals: false,
    cwd: true,
    env: true,
  },
  ollama: {
    runtime: "ollama",
    tools: false,
    streaming: true,
    approvals: false,
    cwd: true,
    env: true,
  },
};

export function runtimeCapability(runtime: RuntimeName): RuntimeCapability {
  return (
    CAPABILITIES[runtime] ?? {
      runtime,
      tools: false,
      streaming: false,
      approvals: false,
      cwd: true,
      env: true,
    }
  );
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

export function runtimeCapabilityRows(runtimes: RuntimeName[]): string[] {
  return runtimes.map((runtime) => {
    const c = runtimeCapability(runtime);
    const enabled = [
      c.tools ? "tools" : "no-tools",
      c.streaming ? "streaming" : "no-streaming",
      c.approvals ? "approvals" : "no-approvals",
      `cwd=${yesNo(c.cwd)}`,
      `env=${yesNo(c.env)}`,
    ];
    return `${runtime.padEnd(7)} capabilities: ${enabled.join(", ")}`;
  });
}

import { RuntimeAdapter, BuildSpecArgs } from "./adapter";
import { RuntimeSpec } from "../types";

export const claudeAdapter: RuntimeAdapter = {
  name: "claude",
  versionArgs: ["--version"],
  envAllowlist: ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "CLAUDE_*"],
  buildSpec({ prompt, cwd, model, config, options }: BuildSpecArgs): RuntimeSpec {
    const args: string[] = [
      "-p",
      "--permission-mode",
      options.permissionMode || config.permissionMode || "plan",
      "--model",
      model,
    ];
    const effort = options.effort || config.effort;
    if (effort) {
      args.push("--effort", effort);
    }
    args.push("-");
    return {
      command: config.command,
      args,
      cwd,
      stdin: prompt,
    };
  },
};

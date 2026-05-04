import { RuntimeAdapter, BuildSpecArgs } from "./adapter";
import { RuntimeSpec } from "../types";

export const codexAdapter: RuntimeAdapter = {
  name: "codex",
  versionArgs: ["--version"],
  buildSpec({ prompt, cwd, model, config, options }: BuildSpecArgs): RuntimeSpec {
    const sandbox = options.sandbox || config.sandbox || "read-only";
    const extra = config.extraArgs || [];
    return {
      command: config.command,
      args: [
        "exec",
        "--sandbox",
        sandbox,
        "--model",
        model,
        "--cd",
        cwd,
        ...extra,
        "-",
      ],
      cwd,
      stdin: prompt,
    };
  },
};

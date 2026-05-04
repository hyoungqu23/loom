import { RuntimeAdapter, BuildSpecArgs } from "./adapter";
import { RuntimeSpec } from "../types";

export const geminiAdapter: RuntimeAdapter = {
  name: "gemini",
  versionArgs: ["--version"],
  buildSpec({ prompt, cwd, model, config, options }: BuildSpecArgs): RuntimeSpec {
    return {
      command: config.command,
      args: [
        "-p",
        "",
        "--approval-mode",
        options.approvalMode || config.approvalMode || "plan",
        "--output-format",
        options.outputFormat || config.outputFormat || "text",
        "--model",
        model,
      ],
      cwd,
      stdin: prompt,
    };
  },
};

import { RuntimeAdapter, BuildSpecArgs } from "./adapter.js";
import { RuntimeSpec } from "../types.js";

export const geminiAdapter: RuntimeAdapter = {
  name: "gemini",
  versionArgs: ["--version"],
  envAllowlist: ["GOOGLE_API_KEY", "GEMINI_API_KEY", "GEMINI_*"],
  buildSpec({ prompt, cwd, model, config, options }: BuildSpecArgs): RuntimeSpec {
    // Gemini CLI requires `-p` to be present to enable non-interactive
    // mode; an empty `-p ""` value flips it into stdin-pipe mode so the
    // full prompt can be streamed via stdin. Locked by gemini.test.ts.
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

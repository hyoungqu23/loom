import { RuntimeAdapter, BuildSpecArgs } from "./adapter";
import { RuntimeSpec } from "../types";

export const ollamaAdapter: RuntimeAdapter = {
  name: "ollama",
  versionArgs: ["--version"],
  buildSpec({ prompt, cwd, model, config }: BuildSpecArgs): RuntimeSpec {
    // `ollama run` accepts the prompt as a positional argv. We deliberately
    // keep argv (not stdin) because piping into `ollama run` triggers REPL-
    // style streaming on some builds, which interleaves output with prompts
    // and breaks the synthesizer's parsing. Locked by ollama.test.ts.
    return {
      command: config.command,
      args: ["run", model, prompt],
      cwd,
    };
  },
};

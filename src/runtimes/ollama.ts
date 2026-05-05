import { RuntimeAdapter, BuildSpecArgs } from "./adapter.js";
import { RuntimeSpec } from "../types.js";

/**
 * Conservative argv byte ceiling chosen to stay safely below the smallest
 * common ARG_MAX (~256KB on macOS) once the model name and `run` overhead
 * are accounted for. Real failures appear long before the OS limit because
 * shell wrappers and accumulated env push against the same budget.
 */
const OLLAMA_ARGV_LIMIT = 100_000;

export const ollamaAdapter: RuntimeAdapter = {
  name: "ollama",
  versionArgs: ["--version"],
  envAllowlist: ["OLLAMA_*"],
  buildSpec({ prompt, cwd, model, config }: BuildSpecArgs): RuntimeSpec {
    // `ollama run` accepts the prompt as a positional argv. We deliberately
    // keep argv (not stdin) because piping into `ollama run` triggers REPL-
    // style streaming on some builds, which interleaves output with prompts
    // and breaks the synthesizer's parsing. Locked by ollama.test.ts.
    const promptBytes = Buffer.byteLength(prompt);
    if (promptBytes > OLLAMA_ARGV_LIMIT) {
      throw new Error(
        `ollama: prompt too large for argv (${promptBytes} bytes > ${OLLAMA_ARGV_LIMIT}). ` +
          "Lower MAX_PRIOR_OUTPUT_CHARS, drop --include-secondary, or switch runtime.",
      );
    }
    return {
      command: config.command,
      args: ["run", model, prompt],
      cwd,
    };
  },
};

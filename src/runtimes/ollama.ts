import { RuntimeAdapter, BuildSpecArgs } from "./adapter";
import { RuntimeSpec } from "../types";

export const ollamaAdapter: RuntimeAdapter = {
  name: "ollama",
  versionArgs: ["--version"],
  buildSpec({ prompt, cwd, model, config }: BuildSpecArgs): RuntimeSpec {
    return {
      command: config.command,
      args: ["run", model, prompt],
      cwd,
    };
  },
};

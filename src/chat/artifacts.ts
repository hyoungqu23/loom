import * as fs from "fs";
import * as path from "path";

export type ChatArtifactFlags = {
  hasContext: boolean;
  hasPlan: boolean;
};

export function readChatArtifactFlags(sessionDir: string): ChatArtifactFlags {
  return {
    hasContext: fs.existsSync(path.join(sessionDir, "CONTEXT.md")),
    hasPlan: fs.existsSync(path.join(sessionDir, "PLAN.md")),
  };
}

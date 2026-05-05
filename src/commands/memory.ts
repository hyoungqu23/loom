import { Flags } from "../types.js";
import { flagString } from "../util/parse-args.js";
import {
  listMemoryCandidates,
  MemoryKind,
  promoteMemoryCandidate,
  rejectMemoryCandidate,
} from "../memory/store.js";
import { searchFeatureSessions } from "../memory/search.js";

function ensureMemoryKind(value: string): MemoryKind {
  if (value === "user" || value === "project" || value === "procedure") {
    return value;
  }
  throw new Error("--type must be one of: user, project, procedure");
}

export function runMemoryCommand(positionals: string[], flags: Flags): void {
  const subcommand = positionals[0] || "list";
  if (subcommand === "list") {
    const candidates = listMemoryCandidates();
    console.log("Memory Candidates\n");
    if (candidates.length === 0) {
      console.log("(none pending)");
      return;
    }
    for (const c of candidates) {
      console.log(
        `${(c.id || "").padEnd(42)} ${c.kind.padEnd(10)} ${c.source} ${c.body.slice(0, 80)}`,
      );
    }
    return;
  }

  if (subcommand === "promote") {
    const id = positionals[1];
    if (!id) throw new Error("Usage: loom memory promote <id> --type user|project|procedure");
    const type = ensureMemoryKind(flagString(flags.type));
    promoteMemoryCandidate(id, type);
    console.log(`[loom] memory candidate promoted: ${id} -> ${type}`);
    return;
  }

  if (subcommand === "reject") {
    const id = positionals[1];
    if (!id) throw new Error("Usage: loom memory reject <id>");
    rejectMemoryCandidate(id);
    console.log(`[loom] memory candidate rejected: ${id}`);
    return;
  }

  if (subcommand === "search") {
    const query = positionals.slice(1).join(" ").trim();
    if (!query) throw new Error('Usage: loom memory search "<query>"');
    const results = searchFeatureSessions(query);
    console.log("Session Search\n");
    if (results.length === 0) {
      console.log("(no matches)");
      return;
    }
    for (const r of results) {
      console.log(`${r.feature}  score=${r.score}`);
      console.log(`  path: ${r.path}`);
      console.log(`  ${r.summary}`);
    }
    return;
  }

  throw new Error(
    'Usage: loom memory list | search "<query>" | promote <id> --type user|project|procedure | reject <id>',
  );
}

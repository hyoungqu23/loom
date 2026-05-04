import * as fs from "fs";
import * as path from "path";
import { ensureWorkspaceState } from "../workspace";

export type MemoryKind = "user" | "project" | "procedure";
export type MemoryConfidence = "low" | "medium" | "high";

export type MemoryEntry = {
  kind: MemoryKind;
  source: string;
  confidence: MemoryConfidence;
  updatedAt: string;
  tags: string[];
  body: string;
};

export type MemoryCandidate = {
  id?: string;
  kind: MemoryKind;
  source: string;
  confidence: MemoryConfidence;
  updatedAt: string;
  tags: string[];
  body: string;
};

const MEMORY_COMMENT_START = "<!-- loom-memory";
const MEMORY_COMMENT_END = "-->";

export function memoryRoot(): string {
  return path.join(ensureWorkspaceState(), "memory");
}

function memoryHeader(title: string): string {
  return [
    `# ${title}`,
    "",
    "Loom stores promoted long-term memory here.",
    "",
    "Each entry should include source, confidence, updatedAt, and tags metadata.",
    "",
  ].join("\n");
}

export function ensureMemoryStore(): string {
  const root = memoryRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, "procedures"), { recursive: true });
  fs.mkdirSync(path.join(root, "candidates"), { recursive: true });
  fs.mkdirSync(path.join(root, "archive"), { recursive: true });

  const files: Array<[string, string]> = [
    ["user.md", "User Memory"],
    ["project.md", "Project Memory"],
  ];
  for (const [file, title] of files) {
    const filePath = path.join(root, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, memoryHeader(title), "utf8");
    }
  }
  return root;
}

function memoryFilePath(kind: MemoryKind): string {
  if (kind === "procedure") return path.join(memoryRoot(), "procedures");
  return path.join(memoryRoot(), `${kind}.md`);
}

function parseMetadata(raw: string): Omit<MemoryEntry, "kind" | "body"> {
  const meta: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }

  const confidence = meta.confidence as MemoryConfidence;
  return {
    source: meta.source || "unknown",
    confidence:
      confidence === "low" || confidence === "high" ? confidence : "medium",
    updatedAt: meta.updatedAt || "",
    tags: (meta.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

export function loadMemoryFile(kind: Exclude<MemoryKind, "procedure">): MemoryEntry[] {
  const filePath = memoryFilePath(kind);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return [];

  const content = fs.readFileSync(filePath, "utf8");
  const entries: MemoryEntry[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const start = content.indexOf(MEMORY_COMMENT_START, cursor);
    if (start === -1) break;
    const metaStart = start + MEMORY_COMMENT_START.length;
    const metaEnd = content.indexOf(MEMORY_COMMENT_END, metaStart);
    if (metaEnd === -1) break;

    const nextStart = content.indexOf(MEMORY_COMMENT_START, metaEnd);
    const bodyStart = metaEnd + MEMORY_COMMENT_END.length;
    const bodyEnd = nextStart === -1 ? content.length : nextStart;
    const body = content.slice(bodyStart, bodyEnd).trim();

    entries.push({
      kind,
      ...parseMetadata(content.slice(metaStart, metaEnd)),
      body,
    });
    cursor = bodyEnd;
  }

  return entries;
}

export function loadCoreMemory(): MemoryEntry[] {
  return [...loadMemoryFile("user"), ...loadMemoryFile("project")];
}

export function renderRelevantMemory(maxChars = 2000): string {
  const entries = loadCoreMemory();
  if (entries.length === 0) return "";

  const lines: string[] = ["## Relevant Memory", ""];
  for (const entry of entries) {
    lines.push(
      `### ${entry.kind === "user" ? "User Memory" : "Project Memory"}`,
    );
    lines.push(
      `source: ${entry.source}; confidence: ${entry.confidence}; updatedAt: ${entry.updatedAt || "unknown"}; tags: ${entry.tags.join(", ") || "none"}`,
    );
    lines.push("");
    lines.push(entry.body);
    lines.push("");
  }

  const rendered = lines.join("\n").trim();
  if (rendered.length <= maxChars) return rendered;
  return rendered.slice(0, maxChars).trimEnd() + "\n...(truncated)";
}

function slugifyBody(body: string): string {
  return (
    body
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "memory"
  );
}

function candidateMarkdown(candidate: MemoryCandidate): string {
  return [
    "---",
    `kind: ${candidate.kind}`,
    `source: ${candidate.source}`,
    `confidence: ${candidate.confidence}`,
    `updatedAt: ${candidate.updatedAt}`,
    `tags: ${candidate.tags.join(", ")}`,
    "---",
    "",
    candidate.body,
    "",
  ].join("\n");
}

export function writeMemoryCandidates(candidates: MemoryCandidate[]): string[] {
  if (candidates.length === 0) return [];
  const root = ensureMemoryStore();
  const dir = path.join(root, "candidates");
  const written: string[] = [];
  const seenBodies = new Set<string>();

  for (const candidate of candidates) {
    const key = candidate.body.trim().toLowerCase();
    if (!key || seenBodies.has(key)) continue;
    seenBodies.add(key);
    const slug = slugifyBody(candidate.body);
    const filePath = path.join(
      dir,
      `${candidate.updatedAt.replace(/[:.]/g, "-")}-${candidate.kind}-${slug}.md`,
    );
    if (fs.existsSync(filePath)) continue;
    fs.writeFileSync(filePath, candidateMarkdown(candidate), "utf8");
    written.push(filePath);
  }

  return written;
}

function parseCandidateFile(filePath: string): MemoryCandidate {
  const content = fs.readFileSync(filePath, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/m.exec(content);
  if (!match) {
    throw new Error(`invalid memory candidate: ${path.basename(filePath)}`);
  }
  const meta = parseMetadata(match[1]);
  const kindLine = /^kind:\s*(.+)$/m.exec(match[1]);
  const rawKind = kindLine?.[1]?.trim();
  const kind: MemoryKind =
    rawKind === "project" || rawKind === "procedure" ? rawKind : "user";
  return {
    id: path.basename(filePath, ".md"),
    kind,
    ...meta,
    body: match[2].trim(),
  };
}

export function listMemoryCandidates(): MemoryCandidate[] {
  const dir = path.join(ensureMemoryStore(), "candidates");
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => parseCandidateFile(path.join(dir, file)));
}

function candidatePath(id: string, area: "candidates" | "archive" = "candidates"): string {
  const safe = path.basename(id).replace(/\.md$/, "");
  return path.join(ensureMemoryStore(), area, `${safe}.md`);
}

function appendPromotedMemory(candidate: MemoryCandidate, type: MemoryKind): void {
  if (type === "procedure") {
    const id = candidate.id || slugifyBody(candidate.body);
    const filePath = path.join(memoryRoot(), "procedures", `${id}.md`);
    fs.writeFileSync(
      filePath,
      [
        "# Procedure Memory",
        "",
        `source: ${candidate.source}`,
        `confidence: ${candidate.confidence}`,
        `updatedAt: ${candidate.updatedAt}`,
        `tags: ${candidate.tags.join(", ")}`,
        "",
        candidate.body,
        "",
      ].join("\n"),
      "utf8",
    );
    return;
  }

  const filePath = path.join(memoryRoot(), `${type}.md`);
  fs.appendFileSync(
    filePath,
    [
      "",
      MEMORY_COMMENT_START,
      `source: ${candidate.source}`,
      `confidence: ${candidate.confidence}`,
      `updatedAt: ${candidate.updatedAt}`,
      `tags: ${candidate.tags.join(", ")}`,
      MEMORY_COMMENT_END,
      candidate.body,
      "",
    ].join("\n"),
    "utf8",
  );
}

export function promoteMemoryCandidate(id: string, type: MemoryKind): string {
  const from = candidatePath(id);
  if (!fs.existsSync(from)) throw new Error(`memory candidate not found: ${id}`);
  const candidate = parseCandidateFile(from);
  appendPromotedMemory(candidate, type);
  fs.unlinkSync(from);
  return type;
}

export function rejectMemoryCandidate(id: string): string {
  const from = candidatePath(id);
  if (!fs.existsSync(from)) throw new Error(`memory candidate not found: ${id}`);
  const to = candidatePath(id, "archive");
  fs.renameSync(from, to);
  return to;
}

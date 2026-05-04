/**
 * Shared parser for the small `| col1 | col2 | ... |` markdown tables that
 * Loom uses to externalize phase / start-phase / contract rules from code.
 *
 * Behaviour:
 *  - Lines outside fenced code blocks (```) are scanned.
 *  - Header / separator rows (`| --- |`, header keyword first cell) are skipped.
 *  - Each retained row's cells are passed through `mapRow`. Returning `null`
 *    drops the row (used for malformed regex literals, unknown phases, etc.).
 *  - Markdown table escape `\|` is honored: `/(a\|b)/` reads as `/(a|b)/`.
 */

const PIPE_TOKEN = "";

export type MarkdownTableMapper<T> = (cells: string[]) => T | null;

export type MarkdownTableOptions = {
  /**
   * Lowercased values of `cells[0]` that mark a header row to skip.
   * E.g. `["pattern", "phase"]`. Header rows are also skipped if every
   * cell is empty after trimming.
   */
  headerCellValues?: string[];
};

export function parseMarkdownTable<T>(
  markdown: string,
  mapRow: MarkdownTableMapper<T>,
  options: MarkdownTableOptions = {},
): T[] {
  if (!markdown) return [];
  const stripped = markdown.replace(/```[\s\S]*?```/g, "");
  const headerCells = new Set(
    (options.headerCellValues ?? []).map((s) => s.toLowerCase()),
  );

  const out: T[] = [];
  for (const rawLine of stripped.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (/^\|[\s\-:|]+\|$/.test(line)) continue; // separator

    const cells = line
      .slice(1, -1)
      .replace(/\\\|/g, PIPE_TOKEN)
      .split("|")
      .map((cell) => cell.trim().replace(new RegExp(PIPE_TOKEN, "g"), "|"));

    if (cells.length < 2) continue;

    const first = cells[0].toLowerCase();
    if (headerCells.has(first)) continue;

    // Empty-row guard.
    if (cells.every((c) => c === "")) continue;

    const mapped = mapRow(cells);
    if (mapped === null || mapped === undefined) continue;
    out.push(mapped);
  }

  return out;
}

/**
 * Compile a `/pattern/flags` markdown literal into a RegExp.
 * Returns null when the literal is malformed so callers can skip the row.
 */
export function compileRegexLiteral(literal: string): RegExp | null {
  const trimmed = literal.trim();
  const match = trimmed.match(/^\/(.+)\/([a-z]*)$/);
  if (!match) return null;
  try {
    return new RegExp(match[1], match[2]);
  } catch {
    return null;
  }
}

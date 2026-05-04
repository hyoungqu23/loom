import { describe, expect, it } from "vitest";
import {
  compileRegexLiteral,
  parseMarkdownTable,
} from "../../src/util/markdown-table";

describe("parseMarkdownTable", () => {
  it("returns [] for empty markdown", () => {
    expect(parseMarkdownTable("", (c) => c)).toEqual([]);
  });

  it("skips separator and header rows", () => {
    const md = [
      "| Pattern | Phase |",
      "|---------|-------|",
      "| /a/i    | plan  |",
      "",
    ].join("\n");
    const rows = parseMarkdownTable<string[]>(md, (cells) => cells, {
      headerCellValues: ["pattern"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(["/a/i", "plan"]);
  });

  it("honors `\\|` escape inside cells", () => {
    const md = [
      "| Pattern | Phase |",
      "|---|---|",
      "| /(a\\|b)/i | discuss |",
      "",
    ].join("\n");
    const rows = parseMarkdownTable<string[]>(md, (cells) => cells, {
      headerCellValues: ["pattern"],
    });
    expect(rows[0][0]).toBe("/(a|b)/i");
  });

  it("strips fenced code blocks before parsing", () => {
    const md = [
      "```",
      "| Pattern | Phase |",
      "| /x/i | impostor |",
      "```",
      "",
      "| Pattern | Phase |",
      "|---|---|",
      "| /y/i | plan |",
      "",
    ].join("\n");
    const rows = parseMarkdownTable<string[]>(md, (cells) => cells, {
      headerCellValues: ["pattern"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(["/y/i", "plan"]);
  });

  it("drops rows where mapRow returns null", () => {
    const md = [
      "| Pattern | Phase |",
      "|---|---|",
      "| /ok/i | plan |",
      "| /skip/i | bogus |",
      "",
    ].join("\n");
    const rows = parseMarkdownTable<string[]>(
      md,
      (cells) => (cells[1] === "bogus" ? null : cells),
      { headerCellValues: ["pattern"] },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toBe("plan");
  });

  it("ignores rows that do not start and end with `|`", () => {
    const md = [
      "Some prose row | not | a | table",
      "| good | row |",
      "",
    ].join("\n");
    const rows = parseMarkdownTable<string[]>(md, (cells) => cells);
    expect(rows).toHaveLength(1);
  });
});

describe("compileRegexLiteral", () => {
  it("compiles `/abc/i` to a working RegExp", () => {
    const re = compileRegexLiteral("/abc/i");
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test("ABC")).toBe(true);
  });

  it("returns null for non-regex input", () => {
    expect(compileRegexLiteral("not-a-regex")).toBeNull();
  });

  it("returns null for invalid pattern", () => {
    expect(compileRegexLiteral("/[/")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { renderMarkdown } from "../../src/chat/markdown.js";

function frame(input: string): string {
  const tree = renderMarkdown(input);
  if (!tree) return "";
  const { lastFrame } = render(tree);
  return lastFrame() || "";
}

describe("renderMarkdown", () => {
  it("returns null for empty / whitespace-only input", () => {
    expect(renderMarkdown("")).toBe(null);
    expect(renderMarkdown("   \n  ")).toBe(null);
  });

  it("renders headings with their depth marker", () => {
    const out = frame("# top\n\n## sub\n\n### third");
    expect(out).toContain("# top");
    expect(out).toContain("## sub");
    expect(out).toContain("### third");
  });

  it("renders paragraphs with inline strong / emphasis / inlineCode", () => {
    const out = frame("**bold** and *italic* and `code` together");
    expect(out).toContain("bold");
    expect(out).toContain("italic");
    expect(out).toContain("code");
    expect(out).toContain("together");
  });

  it("renders unordered list items with bullets", () => {
    const out = frame("- first\n- second\n- third");
    expect(out).toContain("• first");
    expect(out).toContain("• second");
    expect(out).toContain("• third");
  });

  it("renders ordered lists with numeric markers", () => {
    const out = frame("1. alpha\n2. beta\n3. gamma");
    expect(out).toContain("1. alpha");
    expect(out).toContain("2. beta");
    expect(out).toContain("3. gamma");
  });

  it("renders GFM task list checkboxes", () => {
    const out = frame("- [x] done\n- [ ] todo");
    expect(out).toContain("[x] done");
    expect(out).toContain("[ ] todo");
  });

  it("renders fenced code blocks", () => {
    const out = frame("```ts\nconst x = 1;\n```");
    expect(out).toContain("const x = 1;");
  });

  it("renders blockquotes indented", () => {
    const out = frame("> quoted line one\n> quoted line two");
    expect(out).toContain("quoted line one");
    expect(out).toContain("quoted line two");
  });

  it("renders thematic breaks as a horizontal rule", () => {
    const out = frame("before\n\n---\n\nafter");
    expect(out).toContain("before");
    expect(out).toContain("after");
    expect(out).toMatch(/─+/);
  });

  it("renders GFM tables row by row", () => {
    const out = frame(
      [
        "| name  | covers |",
        "|-------|--------|",
        "| login | AC-1   |",
        "| logout| AC-2   |",
      ].join("\n"),
    );
    expect(out).toContain("name");
    expect(out).toContain("covers");
    expect(out).toContain("login");
    expect(out).toContain("AC-1");
    expect(out).toContain("logout");
    expect(out).toContain("AC-2");
  });

  it("falls through unknown nodes without crashing", () => {
    // Image references are parsed by remark but not explicitly handled
    // by our renderer — alt text should still appear via fallback.
    const out = frame("![alt text](https://example.com/x.png) trailing");
    expect(out).toContain("trailing");
  });

  it("renders the synthesis-shape detail content end-to-end", () => {
    const detail = [
      "# synthesis — discuss",
      "",
      "## summary",
      "- decision A",
      "- decision B",
      "",
      "## risks",
      "1. flaky test",
      "2. missing fixtures",
    ].join("\n");
    const out = frame(detail);
    expect(out).toContain("# synthesis — discuss");
    expect(out).toContain("## summary");
    expect(out).toContain("• decision A");
    expect(out).toContain("• decision B");
    expect(out).toContain("## risks");
    expect(out).toContain("1. flaky test");
    expect(out).toContain("2. missing fixtures");
  });
});

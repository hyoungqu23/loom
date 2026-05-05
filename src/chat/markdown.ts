import * as React from "react";
import { Box, Text } from "ink";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type {
  Blockquote,
  Code,
  Emphasis,
  Heading,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Strong,
  Table,
  TableRow,
  Text as MdText,
} from "mdast";

/**
 * Markdown → Ink renderer.
 *
 * Parses markdown via the unified/remark/mdast pipeline and walks the
 * standard AST, mapping each node type to an Ink Box/Text tree. We
 * keep the renderer narrow on purpose:
 *
 * - Block nodes (heading, paragraph, list, code, blockquote, table,
 *   thematicBreak, html) become Box rows or Text rows.
 * - Inline nodes (text, strong, emphasis, inlineCode, link, break,
 *   html) collapse into a single <Text> per parent block so Ink can
 *   wrap and style them as one unit.
 *
 * Anything we don't render explicitly (footnoteReference, image,
 * imageReference, definition, …) silently degrades to its visible
 * text content; these are rare in Loom's chat detail panel.
 */

const processor = unified().use(remarkParse).use(remarkGfm);

const HEADING_COLORS: Record<number, string> = {
  1: "cyan",
  2: "cyan",
  3: "blue",
  4: "blue",
  5: "magenta",
  6: "magenta",
};

export function renderMarkdown(content: string): React.ReactElement | null {
  if (!content || !content.trim()) return null;
  const tree = processor.parse(content) as Root;
  if (tree.children.length === 0) return null;
  return React.createElement(
    Box,
    { flexDirection: "column" },
    ...tree.children.map((node, i) => renderBlock(node, i)),
  );
}

function renderBlock(node: RootContent, key: number): React.ReactNode {
  switch (node.type) {
    case "heading":
      return renderHeading(node, key);
    case "paragraph":
      return renderParagraph(node, key);
    case "list":
      return renderList(node, key);
    case "code":
      return renderCode(node, key);
    case "blockquote":
      return renderBlockquote(node, key);
    case "thematicBreak":
      return React.createElement(
        Text,
        { key, dimColor: true },
        "─".repeat(40),
      );
    case "table":
      return renderTable(node, key);
    case "html":
      return React.createElement(Text, { key, dimColor: true }, node.value);
    default:
      return null;
  }
}

function renderHeading(node: Heading, key: number): React.ReactElement {
  const color = HEADING_COLORS[node.depth] ?? "cyan";
  const prefix = "#".repeat(node.depth) + " ";
  return React.createElement(
    Box,
    { key, marginTop: key === 0 ? 0 : 1 },
    React.createElement(
      Text,
      { bold: true, color },
      prefix,
      ...renderInlineChildren(node.children),
    ),
  );
}

function renderParagraph(node: Paragraph, key: number): React.ReactElement {
  return React.createElement(
    Box,
    { key, marginTop: key === 0 ? 0 : 1 },
    React.createElement(
      Text,
      null,
      ...renderInlineChildren(node.children),
    ),
  );
}

function renderList(node: List, key: number): React.ReactElement {
  const start = node.start ?? 1;
  return React.createElement(
    Box,
    { key, flexDirection: "column", marginTop: key === 0 ? 0 : 1 },
    ...node.children.map((item, i) =>
      renderListItem(item, i, Boolean(node.ordered), start + i),
    ),
  );
}

function renderListItem(
  item: ListItem,
  key: number,
  ordered: boolean,
  ordinal: number,
): React.ReactElement {
  const marker = ordered ? `${ordinal}. ` : "• ";
  const checkboxPrefix =
    typeof item.checked === "boolean"
      ? item.checked
        ? "[x] "
        : "[ ] "
      : "";
  // ListItem children are block-level (usually a single Paragraph).
  // Render them inline to keep the marker on the same row whenever
  // we can — only paragraph and inline-only children are flattened;
  // any nested list/code falls back to vertical layout.
  const flatChildren = flattenListItemChildren(item);
  if (flatChildren) {
    return React.createElement(
      Box,
      { key, flexDirection: "row" },
      React.createElement(Text, null, marker),
      React.createElement(
        Text,
        null,
        checkboxPrefix,
        ...flatChildren,
      ),
    );
  }
  return React.createElement(
    Box,
    { key, flexDirection: "column" },
    React.createElement(Text, null, marker + checkboxPrefix),
    React.createElement(
      Box,
      { flexDirection: "column", marginLeft: 2 },
      ...item.children.map((child, i) =>
        renderBlock(child as RootContent, i),
      ),
    ),
  );
}

function flattenListItemChildren(item: ListItem): React.ReactNode[] | null {
  if (item.children.length === 0) return [];
  if (item.children.length === 1 && item.children[0].type === "paragraph") {
    return renderInlineChildren(
      (item.children[0] as Paragraph).children,
    );
  }
  return null;
}

function renderCode(node: Code, key: number): React.ReactElement {
  return React.createElement(
    Box,
    {
      key,
      flexDirection: "column",
      marginTop: key === 0 ? 0 : 1,
      paddingX: 1,
    },
    React.createElement(
      Text,
      { dimColor: true },
      node.value || "",
    ),
  );
}

function renderBlockquote(node: Blockquote, key: number): React.ReactElement {
  return React.createElement(
    Box,
    {
      key,
      flexDirection: "column",
      marginTop: key === 0 ? 0 : 1,
      paddingLeft: 2,
    },
    ...node.children.map((child, i) => renderBlock(child as RootContent, i)),
  );
}

function renderTable(node: Table, key: number): React.ReactElement {
  return React.createElement(
    Box,
    { key, flexDirection: "column", marginTop: key === 0 ? 0 : 1 },
    ...node.children.map((row, i) => renderTableRow(row, i)),
  );
}

function renderTableRow(row: TableRow, key: number): React.ReactElement {
  return React.createElement(
    Box,
    { key, flexDirection: "row" },
    ...row.children.map((cell, j) =>
      React.createElement(
        Box,
        { key: j, flexBasis: 0, flexGrow: 1, paddingRight: 1 },
        React.createElement(
          Text,
          null,
          ...renderInlineChildren(cell.children),
        ),
      ),
    ),
  );
}

function renderInlineChildren(
  children: readonly PhrasingContent[],
): React.ReactNode[] {
  return children.map((child, i) => renderInline(child, i));
}

function renderInline(node: PhrasingContent, key: number): React.ReactNode {
  switch (node.type) {
    case "text":
      return (node as MdText).value;
    case "strong":
      return React.createElement(
        Text,
        { key, bold: true },
        ...renderInlineChildren((node as Strong).children),
      );
    case "emphasis":
      return React.createElement(
        Text,
        { key, italic: true },
        ...renderInlineChildren((node as Emphasis).children),
      );
    case "inlineCode":
      return React.createElement(
        Text,
        { key, inverse: true },
        (node as InlineCode).value,
      );
    case "link": {
      const link = node as Link;
      return React.createElement(
        Text,
        { key, underline: true, color: "blue" },
        ...renderInlineChildren(link.children),
      );
    }
    case "break":
      return "\n";
    case "html":
      // Raw HTML in markdown is rare in Loom output; render as plain.
      return (node as { value: string }).value;
    case "delete":
      return React.createElement(
        Text,
        { key, strikethrough: true },
        ...renderInlineChildren(
          (node as { children: PhrasingContent[] }).children,
        ),
      );
    default:
      // Unrendered node types (image, footnote, etc.) — fall back to
      // any visible text so the user at least sees something.
      if ("value" in node && typeof (node as { value: unknown }).value === "string") {
        return (node as { value: string }).value;
      }
      if ("children" in node && Array.isArray((node as { children: unknown }).children)) {
        return renderInlineChildren(
          (node as { children: PhrasingContent[] }).children,
        );
      }
      return "";
  }
}

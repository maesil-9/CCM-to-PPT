/**
 * Minimal deterministic XML writer. Attribute order follows insertion order and
 * numbers/strings are emitted verbatim, so identical input always produces
 * byte-identical output (PRD §8.4 determinism). Text and attribute values are
 * escaped; we never inject untrusted external entities.
 */

export type XmlAttrs = Record<string, string | number | undefined>;

export interface XmlNode {
  name: string;
  attrs?: XmlAttrs;
  children?: XmlChild[];
}

export type XmlChild = XmlNode | string;

export function el(name: string, attrs?: XmlAttrs, children?: XmlChild[]): XmlNode {
  const node: XmlNode = { name };
  if (attrs) node.attrs = attrs;
  if (children) node.children = children;
  return node;
}

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function renderAttrs(attrs: XmlAttrs | undefined): string {
  if (!attrs) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    parts.push(`${key}="${escapeAttr(String(value))}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

export function renderNode(node: XmlNode, indent = 0): string {
  const pad = "  ".repeat(indent);
  const attrs = renderAttrs(node.attrs);
  const kids = node.children ?? [];

  if (kids.length === 0) {
    return `${pad}<${node.name}${attrs}/>`;
  }

  const only = kids[0];
  if (kids.length === 1 && typeof only === "string") {
    return `${pad}<${node.name}${attrs}>${escapeText(only)}</${node.name}>`;
  }

  const inner = kids
    .map((child) =>
      typeof child === "string"
        ? `${"  ".repeat(indent + 1)}${escapeText(child)}`
        : renderNode(child, indent + 1),
    )
    .join("\n");
  return `${pad}<${node.name}${attrs}>\n${inner}\n${pad}</${node.name}>`;
}

export interface XmlDocumentOptions {
  declaration?: boolean;
  doctype?: string;
}

export function renderDocument(root: XmlNode, options: XmlDocumentOptions = {}): string {
  const { declaration = true, doctype } = options;
  const lines: string[] = [];
  if (declaration) lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  if (doctype) lines.push(doctype);
  lines.push(renderNode(root, 0));
  return lines.join("\n") + "\n";
}

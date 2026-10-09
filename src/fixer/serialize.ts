import type { SvgDocument, SvgNode } from "../types.ts";
import { sourceSpans } from "../parser/sourceSpans.ts";

/** Apply edits to original source; untouched bytes are never reserialized. */
export function serializeSvg(document: SvgDocument): string {
  if (!document.root) return document.source;
  const retained = new Set<SvgNode>();
  function visit(node: SvgNode) {
    retained.add(node);
    for (const part of node.parts)
      if (part.kind === "element") visit(part.node);
  }
  visit(document.root);
  const edits: { start: number; end: number; value: string }[] = [];
  for (const node of [document.root, ...document.elements]) {
    const span = sourceSpans.get(node)!;
    if (!retained.has(node)) {
      if (node.parent && retained.has(node.parent))
        edits.push({ start: span.start, end: span.end, value: "" });
      continue;
    }
    const added = Object.entries(node.attributes).filter(
      ([key]) => !(key in span.attributes),
    );
    let opening = document.source.slice(span.start, span.openEnd);
    opening = opening.replace(
      /([^\s=<>]+)\s*=\s*(["'])(.*?)\2/gs,
      (match, key: string) => {
        if (!(key in node.attributes)) return "";
        if (node.attributes[key] === span.attributes[key]) return match;
        return `${key}="${escapeAttr(node.attributes[key])}"`;
      },
    );
    if (added.length)
      opening = opening.replace(
        /\/?\s*>$/,
        (end) =>
          added
            .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
            .join("") + end,
      );
    if (opening !== document.source.slice(span.start, span.openEnd))
      edits.push({ start: span.start, end: span.openEnd, value: opening });
  }
  let result = document.source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  return result;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export function removeElement(node: SvgNode): void {
  if (!node.parent) return;
  node.parent.parts = node.parent.parts.filter(
    (p) => p.kind !== "element" || p.node !== node,
  );
}

export function setAttribute(node: SvgNode, key: string, value: string): void {
  node.attributes[key] = value;
}

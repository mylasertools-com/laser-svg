import type { SvgDocument, SvgNode, SvgPart } from "../types.ts";

/**
 * Re-serialize a parsed document back to XML.
 *
 * The parser preserves source order (elements, text, comments), so the only
 * things that change between parse and serialize are the edits the fixer
 * makes: removed elements and added/changed root attributes. Everything else —
 * whitespace, attribute order, self-closing style, comments — round-trips.
 */
export function serializeSvg(document: SvgDocument): string {
  const root = document.root;
  if (!root) return "";
  return document.prolog + serializeElement(root) + document.epilog;
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function serializeAttributes(node: SvgNode): string {
  let out = "";
  for (const [key, value] of Object.entries(node.attributes)) {
    out += ` ${key}="${escapeAttr(value)}"`;
  }
  return out;
}

function serializeElement(node: SvgNode): string {
  const open = `<${node.name}${serializeAttributes(node)}`;
  if (node.parts.length === 0) {
    return `${open}/>`;
  }
  let body = "";
  for (const part of node.parts) {
    body += serializePart(part);
  }
  return `${open}>${body}</${node.name}>`;
}

function serializePart(part: SvgPart): string {
  switch (part.kind) {
    case "element":
      return serializeElement(part.node);
    case "text":
      return escapeText(part.text);
    case "raw":
      switch (part.rawKind) {
        case "comment":
          return `<!--${part.text}-->`;
        case "cdata":
          return `<![CDATA[${part.text}]]>`;
        case "pi":
          return `<?${part.text}?>`;
        case "doctype":
          return `<!DOCTYPE${part.text}>`;
      }
      return "";
  }
}

/**
 * Remove an element from its parent, along with the whitespace-only text
 * node immediately before it (the indentation of its line), so removing a
 * line does not leave a blank or mis-indented line behind. Falls back to
 * the following whitespace node when the element is first on its line.
 */
export function removeElement(node: SvgNode): void {
  const parent = node.parent;
  if (!parent) return;
  const idx = parent.parts.findIndex(
    (p) => p.kind === "element" && p.node === node,
  );
  if (idx === -1) return;
  parent.parts.splice(idx, 1);

  const prev = parent.parts[idx - 1];
  if (prev && prev.kind === "text" && prev.text.trim() === "") {
    parent.parts.splice(idx - 1, 1);
    return;
  }
  const next = parent.parts[idx];
  if (next && next.kind === "text" && next.text.trim() === "") {
    parent.parts.splice(idx, 1);
  }
}

/** Set (or replace) an attribute on a node, preserving position if existing. */
export function setAttribute(node: SvgNode, key: string, value: string): void {
  node.attributes[key] = value;
}

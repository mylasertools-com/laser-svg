import { XMLParser, XMLValidator } from "fast-xml-parser";
import { SvgParseError } from "../types.ts";
import type { SvgDocument, SvgNode, SvgPart, SvgRawKind } from "../types.ts";

type RawEntry = Record<string, unknown>;

/** Key under which fast-xml-parser (preserveOrder) stores attributes. */
const ATTRS_KEY = ":@";
const ATTR_PREFIX = "@_";

const RAW_PART_KEYS: Record<string, SvgRawKind> = {
  "#comment": "comment",
  "#cdata": "cdata",
  "#pi": "pi",
  "#processing-instruction": "pi",
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** True for keys that are not element tags inside an ordered entry. */
function isNonElementKey(key: string): boolean {
  return (
    key === ATTRS_KEY ||
    key === "#text" ||
    key in RAW_PART_KEYS ||
    key.startsWith("?") || // <?xml?>, <?xml-stylesheet?>, ...
    key.startsWith("!") // <!DOCTYPE ...>
  );
}

/** Flatten a comment/CDATA/PI value (an array of #text parts) to a string. */
function flattenRaw(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    let out = "";
    for (const entry of value as RawEntry[]) {
      if (entry && typeof entry === "object" && "#text" in entry) {
        out += String(entry["#text"] ?? "");
      }
    }
    return out;
  }
  return String(value);
}

/**
 * Parse an SVG string into a rule-friendly document model that preserves
 * source order (including whitespace text and comments) so the fixer can
 * re-serialize without touching unrelated content.
 *
 * Throws SvgParseError when the input is not well-formed XML or has no
 * <svg> root element.
 */
export function parseSvg(source: string): SvgDocument {
  // fast-xml-parser does not throw on ill-formed XML by default; validate
  // explicitly so callers get a single, predictable error type.
  const validation = XMLValidator.validate(source);
  if (validation !== true) {
    throw new SvgParseError(`Malformed SVG: ${validation.err.msg}`);
  }

  let parsed: unknown;
  try {
    const parser = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributeNamePrefix: ATTR_PREFIX,
      trimValues: false,
      parseTagValue: false,
      parseAttributeValue: false,
      processEntities: true,
      commentPropName: "#comment",
      cdataPropName: "#cdata",
    });
    parsed = parser.parse(source);
  } catch (err) {
    throw new SvgParseError(
      `Malformed SVG: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const entries = asArray(parsed as RawEntry | RawEntry[]);
  const document: SvgDocument = {
    source,
    root: null,
    elements: [],
    prolog: "",
    epilog: "",
  };
  let counter = 0;

  function buildNode(
    name: string,
    entry: RawEntry,
    parent: SvgNode | undefined,
  ): SvgNode {
    const attributes: Record<string, string> = {};
    const rawAttrs = entry[ATTRS_KEY];
    if (rawAttrs && typeof rawAttrs === "object") {
      for (const [key, value] of Object.entries(rawAttrs as RawEntry)) {
        if (!key.startsWith(ATTR_PREFIX)) continue;
        if (value === null || value === undefined) continue;
        if (typeof value === "object") continue;
        attributes[key.slice(ATTR_PREFIX.length)] = String(value);
      }
    }

    const node: SvgNode = {
      name,
      attributes,
      parts: [],
      text: "",
      ref: `el${counter++}`,
      parent,
    };
    // Register before children so `elements` is in document order.
    document.elements.push(node);

    const childList = entry[name];
    if (Array.isArray(childList)) {
      for (const child of childList as RawEntry[]) {
        if (child === null || typeof child !== "object") continue;
        for (const [key, value] of Object.entries(child)) {
          if (key === ATTRS_KEY) continue;
          if (key === "#text") {
            node.parts.push({
              kind: "text",
              text: value == null ? "" : String(value),
            });
          } else if (key in RAW_PART_KEYS) {
            node.parts.push({
              kind: "raw",
              rawKind: RAW_PART_KEYS[key],
              text: flattenRaw(value),
            });
          } else if (!isNonElementKey(key)) {
            node.parts.push({
              kind: "element",
              node: buildNode(key, child, node),
            });
          }
        }
      }
    } else if (childList !== null && childList !== undefined) {
      const text = String(childList);
      node.parts.push({ kind: "text", text });
      node.text = text;
    }

    node.text = node.parts
      .filter((p): p is Extract<SvgPart, { kind: "text" }> => p.kind === "text")
      .map((p) => p.text)
      .join("");
    return node;
  }

  // Top level: exactly one element, optionally surrounded by declarations,
  // doctype, comments and whitespace.
  const elementEntries = entries.filter(
    (e) =>
      e !== null &&
      typeof e === "object" &&
      Object.keys(e).some((k) => !isNonElementKey(k)),
  );

  if (elementEntries.length === 0) {
    throw new SvgParseError("Malformed SVG: document is empty.");
  }
  if (elementEntries.length > 1) {
    throw new SvgParseError("Malformed SVG: multiple root elements.");
  }

  const rootEntry = elementEntries[0];
  const rootKey = Object.keys(rootEntry).find((k) => !isNonElementKey(k))!;
  if (rootKey !== "svg") {
    throw new SvgParseError(
      `Malformed SVG: expected <svg> root, found <${rootKey}>.`,
    );
  }

  const root = buildNode("svg", rootEntry, undefined);
  // buildNode pushed the root itself; rules treat `root` separately, so
  // remove it from the flat content-element list.
  document.elements.shift();
  document.root = root;

  const span = findRootSpan(source);
  if (span) {
    document.prolog = source.slice(0, span.start);
    document.epilog = source.slice(span.end);
  }
  return document;
}

/**
 * Locate the root <svg> element's span in the source so the fixer can keep
 * everything outside it (declaration, doctype, comments, PIs) verbatim.
 *
 * The scan skips comments, CDATA and processing instructions so a "<svg"
 * inside prolog content is not mistaken for the root, tracks nesting for
 * nested <svg> elements, and handles a self-closing root (<svg .../>).
 */
function findRootSpan(source: string): { start: number; end: number } | null {
  const rootStart = findRootStart(source);
  if (rootStart === -1) return null;

  let depth = 0;
  let i = rootStart;
  while (i < source.length) {
    if (source.startsWith("<!--", i)) {
      const close = source.indexOf("-->", i + 4);
      i = close === -1 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", i)) {
      const close = source.indexOf("]]>", i + 9);
      i = close === -1 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith("<?", i)) {
      const close = source.indexOf("?>", i + 2);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    if (source.startsWith("</", i)) {
      const gt = source.indexOf(">", i);
      if (gt === -1) return null;
      if (source.slice(i + 2, gt).trim() === "svg") {
        depth--;
        if (depth === 0) return { start: rootStart, end: gt + 1 };
      }
      i = gt + 1;
      continue;
    }
    if (source[i] === "<" && /[a-zA-Z]/.test(source[i + 1] ?? "")) {
      const end = findTagEnd(source, i);
      if (end === -1) return null;
      const tagName = /^[a-zA-Z][\w:.-]*/.exec(source.slice(i + 1, end))?.[0];
      const selfClosing = source[end - 2] === "/";
      if (tagName === "svg" && !selfClosing) depth++;
      if (tagName === "svg" && selfClosing && depth === 0) {
        return { start: rootStart, end };
      }
      i = end;
      continue;
    }
    i++;
  }
  return null;
}

/** Index of the root <svg> opening tag, skipping prolog comments/PIs. */
function findRootStart(source: string): number {
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("<!--", i)) {
      const close = source.indexOf("-->", i + 4);
      i = close === -1 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith("<?", i)) {
      const close = source.indexOf("?>", i + 2);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    if (
      source.startsWith("<svg", i) &&
      /^<svg(?=[\s/>])/.test(source.slice(i))
    ) {
      return i;
    }
    i++;
  }
  return -1;
}

/** Index just after the tag's closing ">", respecting quoted attributes. */
function findTagEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i + 1;
    }
  }
  return -1;
}

/** Depth-first walk over all content elements below `node` (exclusive). */
export function walkElements(
  node: SvgNode,
  visit: (element: SvgNode) => void,
): void {
  for (const part of node.parts) {
    if (part.kind === "element") {
      visit(part.node);
      walkElements(part.node, visit);
    }
  }
}

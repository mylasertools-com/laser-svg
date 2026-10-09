import { SvgParseError } from "../types.ts";
import type { SvgDocument, SvgNode } from "../types.ts";

export interface SourceSpan {
  start: number;
  openEnd: number;
  end: number;
  attributes: Record<string, string>;
}
export const sourceSpans = new WeakMap<SvgNode, SourceSpan>();

/** XML is validated/parsed first; this scanner only records byte-preserving edits. */
export function recordSourceSpans(document: SvgDocument): void {
  const source = document.source;
  const nodes = [document.root!, ...document.elements];
  const stack: SvgNode[] = [];
  let index = 0;
  for (let i = 0; i < source.length;) {
    if (source[i] !== "<") {
      i++;
      continue;
    }
    const special = [
      ["<!--", "-->"],
      ["<![CDATA[", "]]>"],
      ["<?", "?>"],
    ].find(([start]) => source.startsWith(start, i));
    if (special) {
      i = source.indexOf(special[1], i + special[0].length) + special[1].length;
      continue;
    }
    let quote = "";
    let subsetDepth = 0;
    let end = i + 1;
    for (; end < source.length; end++) {
      const c = source[end];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (source.startsWith("<!", i) && c === "[") subsetDepth++;
      else if (source.startsWith("<!", i) && c === "]") subsetDepth--;
      else if (c === ">" && subsetDepth === 0) break;
    }
    end++;
    if (source.startsWith("</", i)) {
      const node = stack.pop();
      if (node) sourceSpans.get(node)!.end = end;
    } else if (!source.startsWith("<!", i)) {
      const name = /^<([^\s/>]+)/.exec(source.slice(i, end))?.[1];
      const node = nodes[index++];
      if (!node || node.name !== name)
        throw new SvgParseError(
          "SVG entity-expanded markup cannot be edited safely.",
        );
      sourceSpans.set(node, {
        start: i,
        openEnd: end,
        end,
        attributes: { ...node.attributes },
      });
      if (!/\/\s*>$/.test(source.slice(i, end))) stack.push(node);
    }
    i = end;
  }
  if (index !== nodes.length || stack.length)
    throw new SvgParseError("Could not map SVG elements to source.");
}

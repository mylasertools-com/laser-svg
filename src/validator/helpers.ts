import type { SvgNode } from "../types.ts";

/**
 * Recognized physical units (plus px and %).
 * px is unambiguous as user units; % is treated as ambiguous for lasers.
 */
const LENGTH_RE =
  /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(px|mm|cm|in|pt|%)?\s*$/;

export interface ParsedLength {
  value: number;
  /** Explicit unit as written, or undefined when unitless. */
  unit?: string;
}

/** Initial SVG user units are CSS pixels (96 per inch). */
export function lengthInPixels(length: ParsedLength): number {
  const factors: Record<string, number> = {
    px: 1,
    mm: 96 / 25.4,
    cm: 96 / 2.54,
    in: 96,
    pt: 96 / 72,
  };
  return length.value * (factors[length.unit ?? "px"] ?? 1);
}

/** Parse an SVG length attribute. Returns undefined when malformed. */
export function parseLength(raw: string): ParsedLength | undefined {
  const m = LENGTH_RE.exec(raw);
  if (!m) return undefined;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return undefined;
  return m[2] ? { value, unit: m[2] } : { value };
}

/**
 * Effective value of a presentation property, honoring the CSS `style`
 * attribute over presentation attributes.
 */
export function effectiveProp(node: SvgNode, prop: string): string | undefined {
  const style = node.attributes["style"];
  if (style) {
    for (const decl of style.split(";")) {
      const idx = decl.indexOf(":");
      if (idx === -1) continue;
      if (decl.slice(0, idx).trim().toLowerCase() === prop) {
        return decl.slice(idx + 1).trim();
      }
    }
  }
  return node.attributes[prop];
}

/** Obvious hiding properties: display:none, visibility:hidden, opacity:0. */
export function isHiddenElement(node: SvgNode): boolean {
  const display = effectiveProp(node, "display");
  if (display && display.toLowerCase() === "none") return true;

  const visibility = effectiveProp(node, "visibility");
  if (visibility && ["hidden", "collapse"].includes(visibility.toLowerCase())) {
    return true;
  }

  const opacity = effectiveProp(node, "opacity");
  if (opacity !== undefined) {
    const value = parseFloat(opacity);
    if (Number.isFinite(value) && value === 0) return true;
  }
  return false;
}

/** Human-readable element reference: "#id" when present, else "#path3"-style. */
export function elementLabel(node: SvgNode): string {
  return `#${node.attributes.id ?? node.ref}`;
}

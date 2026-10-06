import { parseSvg } from "../parser/parseSvg.ts";
import { analyzeSvg } from "../validator/analyzeSvg.ts";
import { parseLength } from "../validator/helpers.ts";
import type {
  FixOptions,
  FixResult,
  LaserSvgIssue,
  SvgDocument,
  SvgNode,
} from "../types.ts";
import { removeElement, serializeSvg, setAttribute } from "./serialize.ts";

/** Issue codes the fixer knows how to repair by removing the element. */
const REMOVAL_CODES = new Set(["EMPTY_PATH", "DUPLICATE_PATH"]);

/**
 * Apply safe fixes to an SVG string.
 *
 * Default fixes: remove empty paths, remove exact duplicate paths (keeping
 * the first copy), and add a viewBox when the root width/height make it
 * unambiguous. Hidden elements are only removed with `removeHidden: true`.
 *
 * The fixer never modifies geometry, units, or text — anything it cannot
 * safely repair is returned in `remainingIssues`.
 */
export function fixSvg(svg: string, options: FixOptions = {}): FixResult {
  const document = parseSvg(svg);
  const initial = analyzeSvg(svg);

  const fixes: LaserSvgIssue[] = [];
  const byRef = indexElements(document);

  for (const issue of initial.issues) {
    if (!issue.fixable || !issue.elementId) continue;
    const node = byRef.get(issue.elementId);
    if (!node) continue;

    if (REMOVAL_CODES.has(issue.code)) {
      removeElement(node);
      fixes.push(issue);
    } else if (issue.code === "HIDDEN_ELEMENT" && options.removeHidden) {
      removeElement(node);
      fixes.push(issue);
    }
  }

  const viewBoxFix = applyViewBoxFix(document, initial);
  if (viewBoxFix) fixes.push(viewBoxFix);

  const fixedSvg = serializeSvg(document);
  const remainingIssues = analyzeSvg(fixedSvg).issues;

  return { svg: fixedSvg, fixes, remainingIssues };
}

function indexElements(document: SvgDocument): Map<string, SvgNode> {
  const map = new Map<string, SvgNode>();
  for (const node of document.elements) {
    map.set(node.ref, node);
    if (node.attributes.id) map.set(node.attributes.id, node);
  }
  return map;
}

/**
 * Add a viewBox derived from the root width/height, only when both are
 * present, valid, positive, and no viewBox exists yet (i.e. the
 * MISSING_VIEWBOX issue was reported as fixable).
 */
function applyViewBoxFix(
  document: SvgDocument,
  initial: ReturnType<typeof analyzeSvg>,
): LaserSvgIssue | null {
  const missing = initial.issues.find(
    (i) => i.code === "MISSING_VIEWBOX" && i.fixable,
  );
  const root = document.root;
  if (!missing || !root) return null;

  const width = parseLength(root.attributes["width"] ?? "");
  const height = parseLength(root.attributes["height"] ?? "");
  if (!width || !height || width.value <= 0 || height.value <= 0) return null;
  if (width.unit === "%" || height.unit === "%") return null;

  const viewBox = `0 0 ${format(width.value)} ${format(height.value)}`;
  setAttribute(root, "viewBox", viewBox);
  return {
    code: "MISSING_VIEWBOX",
    severity: "warning",
    message: `Added viewBox="${viewBox}" from the root width/height.`,
    elementType: "svg",
    fixable: true,
  };
}

function format(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

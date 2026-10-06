import { parseSvg } from "../parser/parseSvg.ts";
import type {
  AnalyzeSvgOptions,
  LaserSvgIssue,
  LaserSvgReport,
  ValidationRule,
} from "../types.ts";
import { resolveAnalyzeOptions } from "../types.ts";
import { dimensionsRule, unitsRule } from "./rules/dimensions.ts";
import { viewBoxRule } from "./rules/viewBox.ts";
import { textRule } from "./rules/text.ts";
import { imagesRule } from "./rules/images.ts";
import { advancedFeaturesRule } from "./rules/advancedFeatures.ts";
import { emptyPathsRule } from "./rules/emptyPaths.ts";
import { hiddenElementsRule } from "./rules/hiddenElements.ts";
import { duplicatePathsRule } from "./rules/duplicatePaths.ts";
import { openPathsRule } from "./rules/openPaths.ts";
import { parseLength } from "./helpers.ts";

/** The MVP rule set. Each rule is independent and returns its own issues. */
export const defaultRules: ValidationRule[] = [
  dimensionsRule,
  unitsRule,
  viewBoxRule,
  textRule,
  imagesRule,
  advancedFeaturesRule,
  emptyPathsRule,
  hiddenElementsRule,
  duplicatePathsRule,
  openPathsRule,
];

/**
 * Analyze an SVG string for common laser-cutting problems.
 * Throws SvgParseError for malformed / non-SVG input, and RangeError for
 * invalid options.
 */
export function analyzeSvg(
  svg: string,
  options: AnalyzeSvgOptions = {},
): LaserSvgReport {
  const document = parseSvg(svg);
  const resolved = resolveAnalyzeOptions(options);

  const issues: LaserSvgIssue[] = [];
  for (const rule of defaultRules) {
    issues.push(...rule.run(document, resolved));
  }

  const report: LaserSvgReport = {
    valid: !issues.some((i) => i.severity === "error"),
    elementCount: document.elements.length,
    pathCount: document.elements.filter((e) => e.name === "path").length,
    issues,
  };

  const root = document.root;
  if (root) {
    const width = parseLength(root.attributes["width"] ?? "");
    const height = parseLength(root.attributes["height"] ?? "");
    if (width && width.value > 0) report.width = width.value;
    if (height && height.value > 0) report.height = height.value;

    // Report a physical unit only when both dimensions carry the same one.
    if (
      width?.unit &&
      height?.unit &&
      width.unit === height.unit &&
      width.unit !== "%"
    ) {
      report.units = width.unit;
    }
  }

  return report;
}

import { walkElements } from "../../parser/parseSvg.ts";
import type {
  LaserSvgIssue,
  SvgDocument,
  ValidationRule,
} from "../../types.ts";
import { elementLabel } from "../helpers.ts";

/**
 * LIVE_TEXT — <text> / <tspan> elements. Laser software may substitute
 * fonts or render text differently; text should be converted to outlines
 * in the design tool. Not fixable here (no font rasterizer available).
 */
export const textRule: ValidationRule = {
  run(document: SvgDocument): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    if (!document.root) return issues;

    walkElements(document.root, (node) => {
      if (node.name === "text" || node.name === "tspan") {
        issues.push({
          code: "LIVE_TEXT",
          severity: "warning",
          message:
            node.name === "text"
              ? `Text element ${elementLabel(node)} has not been converted to paths.`
              : `Text span ${elementLabel(node)} is inside live text.`,
          elementId: node.attributes.id ?? node.ref,
          elementType: node.name,
          fixable: false,
        });
      }
    });
    return issues;
  },
};

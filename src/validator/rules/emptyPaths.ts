import { walkElements } from "../../parser/parseSvg.ts";
import { hasUsableGeometry } from "../../geometry/pathData.ts";
import type {
  LaserSvgIssue,
  SvgDocument,
  ValidationRule,
} from "../../types.ts";
import { elementLabel } from "../helpers.ts";

/**
 * EMPTY_PATH — <path> with no d attribute, an empty d, or d containing no
 * drawable command (e.g. only "Z"). Fixable by removing the element.
 */
export const emptyPathsRule: ValidationRule = {
  run(document: SvgDocument): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    if (!document.root) return issues;

    walkElements(document.root, (node) => {
      if (node.name !== "path") return;
      const d = node.attributes["d"];
      if (d !== undefined && hasUsableGeometry(d)) return;
      issues.push({
        code: "EMPTY_PATH",
        severity: "warning",
        message:
          d === undefined
            ? `Path ${elementLabel(node)} has no "d" attribute.`
            : `Path ${elementLabel(node)} has no usable geometry.`,
        elementId: node.attributes.id ?? node.ref,
        elementType: node.name,
        fixable: true,
      });
    });
    return issues;
  },
};

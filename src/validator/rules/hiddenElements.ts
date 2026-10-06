import { walkElements } from "../../parser/parseSvg.ts";
import type {
  LaserSvgIssue,
  SvgDocument,
  ValidationRule,
} from "../../types.ts";
import { elementLabel, isHiddenElement } from "../helpers.ts";

/**
 * HIDDEN_ELEMENT — elements obviously hidden via display:none,
 * visibility:hidden or opacity:0. Removal is opt-in (FixOptions.removeHidden)
 * because hidden elements are often intentional (disabled layers).
 */
export const hiddenElementsRule: ValidationRule = {
  run(document: SvgDocument): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    if (!document.root) return issues;

    walkElements(document.root, (node) => {
      if (!isHiddenElement(node)) return;
      issues.push({
        code: "HIDDEN_ELEMENT",
        severity: "info",
        message: `Element ${elementLabel(node)} is hidden and will not be cut.`,
        elementId: node.attributes.id ?? node.ref,
        elementType: node.name,
        fixable: true,
      });
    });
    return issues;
  },
};

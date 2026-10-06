import type {
  LaserSvgIssue,
  SvgDocument,
  ValidationRule,
} from "../../types.ts";
import { parseLength } from "../helpers.ts";

/**
 * MISSING_VIEWBOX — no viewBox on the root <svg>.
 * Fixable only when both width and height are present and valid, so a
 * viewBox can be synthesized from them without guessing.
 */
export const viewBoxRule: ValidationRule = {
  run(document: SvgDocument): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    const root = document.root;
    if (!root) return issues;

    const viewBox = root.attributes["viewBox"] ?? root.attributes["viewbox"];
    if (viewBox !== undefined && viewBox.trim() !== "") return issues;

    const width = root.attributes["width"];
    const height = root.attributes["height"];
    const usable = (raw: string | undefined) => {
      if (raw === undefined) return false;
      const parsed = parseLength(raw);
      return (
        parsed !== undefined && parsed.value > 0 && parsed.unit !== "%" // a viewBox in percent is meaningless
      );
    };
    const fixable = usable(width) && usable(height);

    issues.push({
      code: "MISSING_VIEWBOX",
      severity: "warning",
      message: fixable
        ? "SVG has no viewBox. A viewBox can be derived from the root width/height."
        : "SVG has no viewBox, and no usable width/height to derive one from.",
      elementType: "svg",
      fixable,
    });
    return issues;
  },
};

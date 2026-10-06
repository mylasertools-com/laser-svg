import type {
  LaserSvgIssue,
  SvgDocument,
  ValidationRule,
} from "../../types.ts";
import { parseLength } from "../helpers.ts";

/**
 * INVALID_DIMENSIONS — root width/height that is non-positive or
 * unparseable.
 */
export const dimensionsRule: ValidationRule = {
  run(document: SvgDocument): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    const root = document.root;
    if (!root) return issues;

    for (const dim of ["width", "height"] as const) {
      const raw = root.attributes[dim];
      if (raw === undefined) continue;

      const parsed = parseLength(raw);
      if (parsed === undefined) {
        issues.push({
          code: "INVALID_DIMENSIONS",
          severity: "error",
          message: `Root ${dim}="${raw}" is not a valid length.`,
          elementType: "svg",
          fixable: false,
        });
        continue;
      }
      if (parsed.value <= 0) {
        issues.push({
          code: "INVALID_DIMENSIONS",
          severity: "error",
          message: `Root ${dim} must be greater than 0 (got "${raw}").`,
          elementType: "svg",
          fixable: false,
        });
      }
    }
    return issues;
  },
};

/**
 * AMBIGUOUS_UNITS — root width/height given without a physical unit
 * (e.g. width="100") or as a percentage. Laser software needs a physical
 * size; we never guess one.
 */
export const unitsRule: ValidationRule = {
  run(document: SvgDocument): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    const root = document.root;
    if (!root) return issues;

    for (const dim of ["width", "height"] as const) {
      const raw = root.attributes[dim];
      if (raw === undefined) continue;

      const parsed = parseLength(raw);
      if (parsed === undefined) continue; // reported by INVALID_DIMENSIONS

      if (!parsed.unit || parsed.unit === "%") {
        issues.push({
          code: "AMBIGUOUS_UNITS",
          severity: "warning",
          message:
            `Root ${dim}="${raw}" has no explicit physical unit ` +
            `(mm, cm, in, pt or px). Laser software may guess the wrong size.`,
          elementType: "svg",
          fixable: false,
        });
      }
    }
    return issues;
  },
};

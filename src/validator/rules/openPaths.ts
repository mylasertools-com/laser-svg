import { walkElements } from "../../parser/parseSvg.ts";
import {
  containsCloseCommand,
  hasUsableGeometry,
} from "../../geometry/pathData.ts";
import type {
  LaserSvgIssue,
  SvgDocument,
  ValidationRule,
} from "../../types.ts";
import { elementLabel } from "../helpers.ts";

/**
 * OPEN_PATH — a <path> whose data contains no closepath (Z/z) command.
 *
 * Known limitation (documented in the README): in v1 this is a purely
 * syntactic check, so genuinely open paths (engraving lines, cut lines)
 * are reported as well — false positives are accepted. The fixer never
 * auto-closes paths, because closing a line that should stay open would
 * silently change the cut.
 */
export const openPathsRule: ValidationRule = {
  run(document: SvgDocument): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    if (!document.root) return issues;

    walkElements(document.root, (node) => {
      if (node.name !== "path") return;
      const d = node.attributes["d"];
      if (d === undefined || !hasUsableGeometry(d)) return; // EMPTY_PATH covers
      if (containsCloseCommand(d)) return;

      issues.push({
        code: "OPEN_PATH",
        severity: "warning",
        message: `Path ${elementLabel(node)} may be open (no closepath command).`,
        elementId: node.attributes.id ?? node.ref,
        elementType: node.name,
        fixable: false,
      });
    });
    return issues;
  },
};

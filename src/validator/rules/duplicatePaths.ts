import { walkElements } from "../../parser/parseSvg.ts";
import { normalizePathData } from "../../geometry/pathData.ts";
import type {
  LaserSvgIssue,
  SvgDocument,
  SvgNode,
  ValidationRule,
} from "../../types.ts";
import { elementLabel } from "../helpers.ts";

/**
 * DUPLICATE_PATH — two <path> elements whose normalized `d` values are
 * identical. MVP scope only: exact geometric duplicates after whitespace /
 * number formatting normalization. No affine-transform equivalence.
 *
 * Fixable only when the whole element is identical apart from `id`: two
 * paths with the same geometry but different presentation attributes
 * (stroke, fill, stroke-width, ...) render differently, so removing one
 * would change the output. Those are reported with fixable: false.
 */
export const duplicatePathsRule: ValidationRule = {
  run(document: SvgDocument): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    if (!document.root) return issues;

    const firstSeen = new Map<string, SvgNode>(); // normalized d -> first path
    walkElements(document.root, (node) => {
      if (node.name !== "path") return;
      const d = node.attributes["d"];
      if (d === undefined || d.trim() === "") return; // EMPTY_PATH covers this

      const key = normalizePathData(d);
      const original = firstSeen.get(key);
      if (original === undefined) {
        firstSeen.set(key, node);
        return;
      }

      const identical = attributesEqualIgnoringId(original, node);
      issues.push({
        code: "DUPLICATE_PATH",
        severity: "warning",
        message: identical
          ? `Path ${elementLabel(node)} duplicates ${elementLabel(original)}.`
          : `Path ${elementLabel(node)} has the same geometry as ${elementLabel(original)} but different attributes.`,
        elementId: node.attributes.id ?? node.ref,
        elementType: node.name,
        fixable: identical,
      });
    });
    return issues;
  },
};

function attributesEqualIgnoringId(a: SvgNode, b: SvgNode): boolean {
  const keys = new Set([
    ...Object.keys(a.attributes),
    ...Object.keys(b.attributes),
  ]);
  keys.delete("id");
  for (const key of keys) {
    if (a.attributes[key] !== b.attributes[key]) return false;
  }
  return true;
}

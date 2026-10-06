import { walkElements } from "../../parser/parseSvg.ts";
import {
  absolutizePathData,
  normalizePathData,
  pathTokensWithinTolerance,
} from "../../geometry/pathData.ts";
import type {
  LaserSvgIssue,
  ResolvedAnalyzeOptions,
  SvgDocument,
  SvgNode,
  ValidationRule,
} from "../../types.ts";
import { elementLabel } from "../helpers.ts";

/**
 * DUPLICATE_PATH / NEAR_DUPLICATE_PATH
 *
 * Exact duplicates — identical normalized `d` (whitespace and number
 * formatting ignored). Fixable only when the whole element is identical
 * apart from `id`: paths with the same geometry but different presentation
 * attributes render differently, so removing one would change the output.
 *
 * Near duplicates — same command sequence after absolutization (relative
 * commands converted to absolute), with every numeric parameter within
 * `options.duplicateTolerance` user units (inclusive). Reported as
 * NEAR_DUPLICATE_PATH and NEVER fixable: two deliberately separate laser
 * passes can legitimately run close together, so auto-removal is unsafe.
 *
 * A near-duplicate check only runs when a path is not already an exact
 * duplicate of an earlier one. Out of scope (documented): reversed
 * geometry, different starting points, cross-element-type comparison,
 * reparameterized curves, overlap detection.
 */
export const duplicatePathsRule: ValidationRule = {
  run(document: SvgDocument, options: ResolvedAnalyzeOptions): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    if (!document.root) return issues;

    interface Seen {
      node: SvgNode;
      normalized: string;
      absolute: ReturnType<typeof absolutizePathData>;
    }
    const seen: Seen[] = [];

    walkElements(document.root, (node) => {
      if (node.name !== "path") return;
      const d = node.attributes["d"];
      if (d === undefined || d.trim() === "") return; // EMPTY_PATH covers this

      const normalized = normalizePathData(d);
      const exact = seen.find((s) => s.normalized === normalized);
      if (exact !== undefined) {
        const identical = attributesEqualIgnoringId(exact.node, node);
        issues.push({
          code: "DUPLICATE_PATH",
          severity: "warning",
          message: identical
            ? `Path ${elementLabel(node)} duplicates ${elementLabel(exact.node)}.`
            : `Path ${elementLabel(node)} has the same geometry as ${elementLabel(exact.node)} but different attributes.`,
          elementId: node.attributes.id ?? node.ref,
          elementType: node.name,
          fixable: identical,
        });
        seen.push({ node, normalized, absolute: absolutizePathData(d) });
        return;
      }

      if (options.duplicateTolerance > 0) {
        const absolute = absolutizePathData(d);
        if (absolute !== null) {
          for (const earlier of seen) {
            if (
              earlier.absolute !== null &&
              pathTokensWithinTolerance(
                earlier.absolute,
                absolute,
                options.duplicateTolerance,
              )
            ) {
              issues.push({
                code: "NEAR_DUPLICATE_PATH",
                severity: "warning",
                message: `Path ${elementLabel(node)} is within ${options.duplicateTolerance} units of ${elementLabel(earlier.node)}.`,
                elementId: node.attributes.id ?? node.ref,
                elementType: node.name,
                fixable: false,
              });
              break; // report against the first near match only
            }
          }
        }
      }

      seen.push({ node, normalized, absolute: absolutizePathData(d) });
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

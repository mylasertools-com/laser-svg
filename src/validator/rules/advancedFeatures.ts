import { walkElements } from "../../parser/parseSvg.ts";
import type {
  LaserSvgIssue,
  SvgDocument,
  ValidationRule,
} from "../../types.ts";
import { elementLabel } from "../helpers.ts";

/**
 * FILTER_PRESENT / MASK_PRESENT / CLIP_PATH_PRESENT / PATTERN_PRESENT —
 * features laser software usually ignores or flattens unpredictably.
 * The MVP reports them but does not flatten them.
 */
const FEATURE_TAGS: Record<string, { code: string; label: string }> = {
  filter: { code: "FILTER_PRESENT", label: "filter" },
  mask: { code: "MASK_PRESENT", label: "mask" },
  clipPath: { code: "CLIP_PATH_PRESENT", label: "clip path" },
  pattern: { code: "PATTERN_PRESENT", label: "pattern" },
};

export const advancedFeaturesRule: ValidationRule = {
  run(document: SvgDocument): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    if (!document.root) return issues;

    walkElements(document.root, (node) => {
      const feature = FEATURE_TAGS[node.name];
      if (!feature) return;
      issues.push({
        code: feature.code,
        severity: "warning",
        message: `SVG contains a ${feature.label} (${elementLabel(node)}); laser software may ignore or flatten it.`,
        elementId: node.attributes.id ?? node.ref,
        elementType: node.name,
        fixable: false,
      });
    });
    return issues;
  },
};

import { walkElements } from "../../parser/parseSvg.ts";
import type {
  LaserSvgIssue,
  SvgDocument,
  ValidationRule,
} from "../../types.ts";
import { elementLabel } from "../helpers.ts";

/**
 * RASTER_IMAGE — <image> elements (embedded or linked bitmaps). Laser
 * drivers handle rasters inconsistently; engraving from raster is a
 * separate workflow. Informational only.
 */
export const imagesRule: ValidationRule = {
  run(document: SvgDocument): LaserSvgIssue[] {
    const issues: LaserSvgIssue[] = [];
    if (!document.root) return issues;

    walkElements(document.root, (node) => {
      if (node.name === "image") {
        issues.push({
          code: "RASTER_IMAGE",
          severity: "info",
          message: `Element ${elementLabel(node)} embeds or links a raster image.`,
          elementId: node.attributes.id ?? node.ref,
          elementType: node.name,
          fixable: false,
        });
      }
    });
    return issues;
  },
};

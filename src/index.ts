export type {
  LaserSvgIssue,
  LaserSvgReport,
  FixOptions,
  FixResult,
  AnalyzeSvgOptions,
  Severity,
  ValidationRule,
} from "./types.ts";
export { SvgParseError } from "./types.ts";

export { analyzeSvg, defaultRules } from "./validator/analyzeSvg.ts";
export { fixSvg } from "./fixer/fixSvg.ts";
export { parseSvg } from "./parser/parseSvg.ts";

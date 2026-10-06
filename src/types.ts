/**
 * Public data model for laser-svg.
 */

export type Severity = "error" | "warning" | "info";

export interface LaserSvgIssue {
  /** Stable machine-readable code, e.g. "OPEN_PATH". */
  code: string;
  severity: Severity;
  message: string;

  elementId?: string;
  elementType?: string;

  fixable: boolean;
}

export interface LaserSvgReport {
  /** True when no issue has severity "error". */
  valid: boolean;

  width?: number;
  height?: number;
  /** Physical unit the dimensions are expressed in, when unambiguous. */
  units?: string;

  elementCount: number;
  pathCount: number;

  issues: LaserSvgIssue[];
}

export interface FixOptions {
  /**
   * Remove elements hidden via display:none, visibility:hidden or opacity:0.
   * Off by default: "hidden" may be intentional (e.g. disabled layers).
   */
  removeHidden?: boolean;
}

export interface FixResult {
  svg: string;
  fixes: LaserSvgIssue[];
  remainingIssues: LaserSvgIssue[];
}

export interface AnalyzeSvgOptions {
  /**
   * Coordinate tolerance (in SVG user units) for near-duplicate path
   * detection. `0` disables fuzzy matching (exact duplicates only).
   * Default: 0.01.
   */
  duplicateTolerance?: number;
}

/** AnalyzeSvgOptions after defaults are applied. */
export interface ResolvedAnalyzeOptions {
  duplicateTolerance: number;
}

export const DEFAULT_ANALYZE_OPTIONS: ResolvedAnalyzeOptions = {
  duplicateTolerance: 0.01,
};

/** Merge user options with defaults; throws RangeError on invalid values. */
export function resolveAnalyzeOptions(
  options: AnalyzeSvgOptions = {},
): ResolvedAnalyzeOptions {
  const tolerance =
    options.duplicateTolerance ?? DEFAULT_ANALYZE_OPTIONS.duplicateTolerance;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError(
      `duplicateTolerance must be a finite number >= 0 (got ${options.duplicateTolerance}).`,
    );
  }
  return { duplicateTolerance: tolerance };
}

/* ------------------------------------------------------------------ */
/* Internal document model (kept minimal so rules stay easy to write)  */
/* ------------------------------------------------------------------ */

export type SvgRawKind = "comment" | "pi" | "cdata" | "doctype";

/** One child slot of an element, in source order. */
export type SvgPart =
  | { kind: "element"; node: SvgNode }
  | { kind: "text"; text: string }
  | { kind: "raw"; rawKind: SvgRawKind; text: string };

export interface SvgNode {
  /** Element tag name (XML local name). */
  name: string;
  /** Raw attribute map (insertion order preserved). */
  attributes: Record<string, string>;
  /** Children in source order (elements, text, comments, ...). */
  parts: SvgPart[];
  /** Concatenated direct text content. */
  text: string;
  /** Stable id assigned during parsing, used for element references. */
  ref: string;
  /** Containing element (undefined for the root <svg>). */
  parent?: SvgNode;
}

export interface SvgDocument {
  /** Raw source. */
  source: string;
  /** "svg" root element, or null when the document has no usable root. */
  root: SvgNode | null;
  /** All content elements (excluding the root <svg>) in document order. */
  elements: SvgNode[];
  /**
   * Raw source before the root element (XML declaration, doctype, leading
   * comments/PIs/whitespace). Preserved verbatim by the fixer.
   */
  prolog: string;
  /** Raw source after the root element's closing tag. */
  epilog: string;
}

export interface ValidationRule {
  run(document: SvgDocument, options: ResolvedAnalyzeOptions): LaserSvgIssue[];
}

/** Thrown by parseSvg for malformed / non-SVG input. */
export class SvgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgParseError";
  }
}

/**
 * Geometry helpers for SVG path data.
 *
 * This module is intentionally dependency-free and self-contained so it can be
 * extracted into a standalone `laser-geometry` package later without touching
 * the validation rules.
 */

const PATH_COMMANDS = "MmLlHhVvCcSsQqTtAaZz";

export interface PathCommandToken {
  command: string;
  args: number[];
}

/**
 * Tokenize SVG path data into command + numeric-argument pairs.
 * Returns null when the data is malformed (unknown command letter, a number
 * before any command, or unparseable characters).
 */
export function tokenizePathData(d: string): PathCommandToken[] | null {
  const tokens: PathCommandToken[] = [];
  const numberRe = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
  let i = 0;
  let current: PathCommandToken | null = null;

  while (i < d.length) {
    const ch = d[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === ",") {
      i++;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      if (!PATH_COMMANDS.includes(ch)) return null;
      current = { command: ch, args: [] };
      tokens.push(current);
      i++;
      continue;
    }
    numberRe.lastIndex = i;
    const match = numberRe.exec(d);
    if (!match || match.index !== i) return null;
    if (current === null) return null;
    current.args.push(parseFloat(match[0]));
    i = numberRe.lastIndex;
  }
  return tokens;
}

function formatNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

/**
 * Canonical form of path data for exact-duplicate comparison:
 * command letters preserved, numbers re-formatted, whitespace collapsed.
 * Malformed data falls back to the trimmed raw string.
 */
export function normalizePathData(d: string): string {
  const tokens = tokenizePathData(d);
  if (tokens === null) return d.trim();
  return tokens
    .map((t) =>
      t.args.length > 0
        ? `${t.command} ${t.args.map(formatNumber).join(" ")}`
        : t.command,
    )
    .join(" ");
}

/** True when the path data contains at least one drawable command. */
export function hasUsableGeometry(d: string): boolean {
  const trimmed = d.trim();
  if (trimmed === "") return false;
  const tokens = tokenizePathData(trimmed);
  if (tokens === null) return true; // malformed but non-empty: not "empty"
  return tokens.some((t) => t.command !== "z" && t.command !== "Z");
}

/** True when the path data contains a closepath (Z/z) command. */
export function containsCloseCommand(d: string): boolean {
  const tokens = tokenizePathData(d);
  if (tokens === null) return /[zZ]/.test(d);
  return tokens.some((t) => t.command === "z" || t.command === "Z");
}

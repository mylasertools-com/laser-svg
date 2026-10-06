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

/* ------------------------------------------------------------------ */
/* Absolute normalization (for tolerance-based comparison)             */
/* ------------------------------------------------------------------ */

const ARG_COUNTS: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
};

/**
 * Convert path data to absolute commands: relative commands are offset by
 * the current point, implicit repetitions (e.g. extra pairs after M) are
 * expanded into explicit L commands, and the current point is tracked
 * through Z. This makes `M10 10 l40 0` and `M10 10 L50 10` compare equal.
 *
 * Returns null for malformed data (unknown command, wrong argument count).
 * H/V are kept as H/V (not expanded to L) — they are exact after
 * absolutization and only compare against the same command type.
 */
export function absolutizePathData(d: string): PathCommandToken[] | null {
  const tokens = tokenizePathData(d);
  if (tokens === null) return null;

  const out: PathCommandToken[] = [];
  let cx = 0;
  let cy = 0;
  let subX = 0;
  let subY = 0;

  for (const token of tokens) {
    const upper = token.command.toUpperCase();
    const rel = token.command !== upper;
    const dx = rel ? cx : 0;
    const dy = rel ? cy : 0;

    if (upper === "Z") {
      if (token.args.length !== 0) return null;
      out.push({ command: "Z", args: [] });
      cx = subX;
      cy = subY;
      continue;
    }

    const n = ARG_COUNTS[upper];
    if (
      n === undefined ||
      token.args.length === 0 ||
      token.args.length % n !== 0
    ) {
      return null;
    }

    for (let i = 0; i < token.args.length; i += n) {
      const a = token.args.slice(i, i + n);
      let command = upper;
      let args: number[];

      switch (upper) {
        case "M": {
          // First pair is a moveto; extra pairs are implicit linetos.
          command = i === 0 ? "M" : "L";
          cx = a[0] + dx;
          cy = a[1] + dy;
          args = [cx, cy];
          if (i === 0) {
            subX = cx;
            subY = cy;
          }
          break;
        }
        case "L":
          cx = a[0] + dx;
          cy = a[1] + dy;
          args = [cx, cy];
          break;
        case "H":
          cx = a[0] + dx;
          args = [cx];
          break;
        case "V":
          cy = a[0] + dy;
          args = [cy];
          break;
        case "C":
          args = [
            a[0] + dx,
            a[1] + dy,
            a[2] + dx,
            a[3] + dy,
            a[4] + dx,
            a[5] + dy,
          ];
          cx = a[4] + dx;
          cy = a[5] + dy;
          break;
        case "S":
        case "Q":
          args = [a[0] + dx, a[1] + dy, a[2] + dx, a[3] + dy];
          cx = a[2] + dx;
          cy = a[3] + dy;
          break;
        case "T":
          cx = a[0] + dx;
          cy = a[1] + dy;
          args = [cx, cy];
          break;
        case "A":
          // rx ry rotation large-arc-flag sweep-flag x y — only the
          // endpoint is relative; flags and radii are copied verbatim.
          args = [a[0], a[1], a[2], a[3], a[4], a[5] + dx, a[6] + dy];
          cx = a[5] + dx;
          cy = a[6] + dy;
          break;
        default:
          return null;
      }
      out.push({ command, args });
    }
  }
  return out;
}

/**
 * True when two absolutized token lists describe the same command sequence
 * with every numeric parameter within `tolerance`. Arc flags (large-arc,
 * sweep) are discrete and must match exactly.
 */
export function pathTokensWithinTolerance(
  a: PathCommandToken[],
  b: PathCommandToken[],
  tolerance: number,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ta = a[i];
    const tb = b[i];
    if (ta.command !== tb.command || ta.args.length !== tb.args.length) {
      return false;
    }
    for (let j = 0; j < ta.args.length; j++) {
      const isArcFlag = ta.command === "A" && (j === 3 || j === 4);
      if (isArcFlag) {
        if (ta.args[j] !== tb.args[j]) return false;
      } else if (Math.abs(ta.args[j] - tb.args[j]) > tolerance) {
        return false;
      }
    }
  }
  return true;
}

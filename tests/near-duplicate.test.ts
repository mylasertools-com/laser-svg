import { describe, expect, it } from "vitest";

import { analyzeSvg } from "../src/validator/analyzeSvg.ts";
import { fixSvg } from "../src/fixer/fixSvg.ts";
import {
  absolutizePathData,
  pathTokensWithinTolerance,
} from "../src/geometry/pathData.ts";
import type { LaserSvgIssue } from "../src/types.ts";
import { fixture } from "./helpers.ts";

const HEAD = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">`;

function issuesOf(
  svg: string,
  code: string,
  tolerance?: number,
): LaserSvgIssue[] {
  const options =
    tolerance === undefined ? {} : { duplicateTolerance: tolerance };
  return analyzeSvg(svg, options).issues.filter((i) => i.code === code);
}

describe("absolutizePathData", () => {
  it("converts relative commands to absolute", () => {
    const a = absolutizePathData("M10 10 l40 0");
    const b = absolutizePathData("M10 10 L50 10");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).toEqual(b);
  });

  it("expands implicit repetitions", () => {
    const a = absolutizePathData("M 0 0 10 10 20 20");
    expect(a?.map((t) => t.command).join("")).toBe("MLL");
  });

  it("tracks the current point through Z", () => {
    const a = absolutizePathData("M 10 10 L 20 20 Z l 5 5");
    // after Z the current point returns to the subpath start (10,10)
    expect(a?.[3]).toEqual({ command: "L", args: [15, 15] });
  });

  it("keeps arc flags verbatim and absolutizes endpoints", () => {
    const a = absolutizePathData("M 0 0 a 5 5 0 0 1 10 10");
    expect(a?.[1]).toEqual({ command: "A", args: [5, 5, 0, 0, 1, 10, 10] });
  });

  it("rejects malformed data", () => {
    expect(absolutizePathData("M 0 0 X 1")).toBeNull();
    expect(absolutizePathData("C 1 2 3")).toBeNull(); // wrong arg count
  });
});

describe("pathTokensWithinTolerance", () => {
  const t = (d: string) => absolutizePathData(d)!;

  it("uses inclusive comparison", () => {
    expect(pathTokensWithinTolerance(t("M 10 10"), t("M 10.01 10"), 0.01)).toBe(
      true,
    );
    expect(
      pathTokensWithinTolerance(t("M 10 10"), t("M 10.011 10"), 0.01),
    ).toBe(false);
  });

  it("requires the same command sequence", () => {
    expect(
      pathTokensWithinTolerance(
        t("M 10 10 L 50 10"),
        t("M 10 10 C 20 20 30 30 50 10"),
        1,
      ),
    ).toBe(false);
  });
});

describe("NEAR_DUPLICATE_PATH", () => {
  it("detects near duplicates at default tolerance 0.01", () => {
    const issues = issuesOf(
      fixture("near-duplicate.svg"),
      "NEAR_DUPLICATE_PATH",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].elementId).toBe("outline-copy");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].fixable).toBe(false);
    expect(issues[0].message).toContain("within 0.01 units");
    expect(issues[0].message).toContain("#outline");
  });

  it("does not fire when the difference exceeds the tolerance", () => {
    const svg = `${HEAD}<path d="M 10 10 L 50 10"/><path d="M 10.02 10 L 50 10"/></svg>`;
    expect(issuesOf(svg, "NEAR_DUPLICATE_PATH")).toHaveLength(0);
  });

  it("fires at the exact boundary (difference == tolerance)", () => {
    const svg = `${HEAD}<path d="M 10 10 L 50 10"/><path d="M 10.01 10 L 50 10"/></svg>`;
    expect(issuesOf(svg, "NEAR_DUPLICATE_PATH")).toHaveLength(1);
  });

  it("respects a custom tolerance", () => {
    const svg = `${HEAD}<path d="M 10 10 L 50 10"/><path d="M 10.005 10 L 50 10"/></svg>`;
    expect(issuesOf(svg, "NEAR_DUPLICATE_PATH", 0.001)).toHaveLength(0);
    expect(issuesOf(svg, "NEAR_DUPLICATE_PATH", 0.01)).toHaveLength(1);
  });

  it("compares relative and absolute forms as near duplicates", () => {
    const svg = `${HEAD}<path d="M10 10 l40 0"/><path d="M10 10 L50 10"/></svg>`;
    // Absolutized forms are identical (difference 0 <= tolerance), but the
    // exact-match check is syntax-only, so this lands in NEAR.
    expect(issuesOf(svg, "NEAR_DUPLICATE_PATH")).toHaveLength(1);
    expect(issuesOf(svg, "DUPLICATE_PATH")).toHaveLength(0);
  });

  it("does not fire with tolerance 0", () => {
    const issues = issuesOf(
      fixture("near-duplicate.svg"),
      "NEAR_DUPLICATE_PATH",
      0,
    );
    expect(issues).toHaveLength(0);
  });

  it("still reports exact duplicates with tolerance 0", () => {
    const svg = `${HEAD}<path d="M 10 10 L 50 10"/><path d="M 10 10 L 50 10"/></svg>`;
    expect(issuesOf(svg, "DUPLICATE_PATH", 0)).toHaveLength(1);
  });

  it("never emits both codes for the same pair", () => {
    const exact = `${HEAD}<path d="M 10 10 L 50 10"/><path d="M 10 10 L 50 10"/></svg>`;
    expect(issuesOf(exact, "NEAR_DUPLICATE_PATH")).toHaveLength(0);
    expect(issuesOf(exact, "DUPLICATE_PATH")).toHaveLength(1);
  });

  it("does not match reversed geometry (out of scope)", () => {
    const svg = `${HEAD}<path d="M 0 0 L 100 0"/><path d="M 100 0 L 0 0"/></svg>`;
    expect(issuesOf(svg, "NEAR_DUPLICATE_PATH")).toHaveLength(0);
  });
});

describe("fixSvg with near duplicates", () => {
  it("never removes near duplicates", () => {
    const result = fixSvg(fixture("near-duplicate.svg"));
    expect(result.fixes).toHaveLength(0);
    expect(result.svg).toContain('id="outline"');
    expect(result.svg).toContain('id="outline-copy"');
    expect(result.remainingIssues.map((i) => i.code)).toContain(
      "NEAR_DUPLICATE_PATH",
    );
  });

  it("still removes exact duplicates", () => {
    const result = fixSvg(fixture("duplicate-path.svg"));
    expect(result.fixes.map((f) => f.code)).toContain("DUPLICATE_PATH");
  });
});

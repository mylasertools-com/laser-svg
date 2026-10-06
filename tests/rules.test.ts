import { describe, expect, it } from "vitest";

import { analyzeSvg } from "../src/validator/analyzeSvg.ts";
import type { LaserSvgIssue } from "../src/types.ts";
import { fixture } from "./helpers.ts";

function codes(svg: string): string[] {
  return analyzeSvg(svg).issues.map((i) => i.code);
}

function issuesOf(svg: string, code: string): LaserSvgIssue[] {
  return analyzeSvg(svg).issues.filter((i) => i.code === code);
}

const HEAD = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">`;

describe("MISSING_VIEWBOX", () => {
  it("fires when viewBox is absent", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm"><path d="M 0 0 Z"/></svg>`;
    const issues = issuesOf(svg, "MISSING_VIEWBOX");
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].fixable).toBe(true);
  });

  it("does not fire when viewBox is present", () => {
    expect(codes(`${HEAD}<path d="M 0 0 Z"/></svg>`)).not.toContain(
      "MISSING_VIEWBOX",
    );
  });

  it("is not fixable without usable width/height", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="M 0 0 Z"/></svg>`;
    expect(issuesOf(svg, "MISSING_VIEWBOX")[0].fixable).toBe(false);
  });
});

describe("AMBIGUOUS_UNITS", () => {
  it("fires for unitless dimensions", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"/>`;
    expect(issuesOf(svg, "AMBIGUOUS_UNITS")).toHaveLength(2);
    expect(issuesOf(svg, "AMBIGUOUS_UNITS")[0].fixable).toBe(false);
  });

  it("accepts mm, cm, in, pt and px", () => {
    for (const unit of ["mm", "cm", "in", "pt", "px"]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10${unit}" height="10${unit}" viewBox="0 0 10 10"/>`;
      expect(codes(svg)).not.toContain("AMBIGUOUS_UNITS");
    }
  });

  it("fires for percentage dimensions", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 10 10"/>`;
    expect(codes(svg)).toContain("AMBIGUOUS_UNITS");
  });
});

describe("INVALID_DIMENSIONS", () => {
  it("fires for zero and negative dimensions", () => {
    expect(
      issuesOf(
        `<svg xmlns="http://www.w3.org/2000/svg" width="0mm" height="-5mm" viewBox="0 0 1 1"/>`,
        "INVALID_DIMENSIONS",
      ),
    ).toHaveLength(2);
  });

  it("fires for malformed dimensions", () => {
    const issues = issuesOf(
      `<svg xmlns="http://www.w3.org/2000/svg" width="abc" height="10mm" viewBox="0 0 1 1"/>`,
      "INVALID_DIMENSIONS",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  it("does not fire for valid dimensions", () => {
    expect(codes(`${HEAD}</svg>`)).not.toContain("INVALID_DIMENSIONS");
  });
});

describe("LIVE_TEXT", () => {
  it("detects <text> and <tspan>", () => {
    const issues = issuesOf(fixture("text.svg"), "LIVE_TEXT");
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.every((i) => i.fixable === false)).toBe(true);
    expect(issues.some((i) => i.elementId === "title")).toBe(true);
  });

  it("does not fire without text elements", () => {
    expect(codes(fixture("valid.svg"))).not.toContain("LIVE_TEXT");
  });
});

describe("RASTER_IMAGE", () => {
  it("detects <image>", () => {
    const svg = `${HEAD}<image id="pic" href="photo.png" width="10" height="10"/></svg>`;
    const issues = issuesOf(svg, "RASTER_IMAGE");
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("info");
    expect(issues[0].fixable).toBe(false);
  });

  it("does not fire without images", () => {
    expect(codes(fixture("valid.svg"))).not.toContain("RASTER_IMAGE");
  });
});

describe("advanced features", () => {
  it("detects filter, mask, clipPath and pattern with distinct codes", () => {
    const codes_ = codes(fixture("advanced-features.svg"));
    expect(codes_).toContain("FILTER_PRESENT");
    expect(codes_).toContain("MASK_PRESENT");
    expect(codes_).toContain("CLIP_PATH_PRESENT");
    expect(codes_).toContain("PATTERN_PRESENT");
  });

  it("does not fire for plain defs", () => {
    const svg = `${HEAD}<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs></svg>`;
    const flat = codes(svg);
    expect(flat).not.toContain("FILTER_PRESENT");
    expect(flat).not.toContain("MASK_PRESENT");
    expect(flat).not.toContain("CLIP_PATH_PRESENT");
    expect(flat).not.toContain("PATTERN_PRESENT");
  });
});

describe("EMPTY_PATH", () => {
  it("detects empty and whitespace-only d attributes", () => {
    const issues = issuesOf(fixture("empty-path.svg"), "EMPTY_PATH");
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.every((i) => i.fixable)).toBe(true);
  });

  it("detects a path with no d attribute", () => {
    expect(codes(`${HEAD}<path id="p"/></svg>`)).toContain("EMPTY_PATH");
  });

  it("does not fire for paths with geometry", () => {
    expect(codes(fixture("valid.svg"))).not.toContain("EMPTY_PATH");
  });
});

describe("HIDDEN_ELEMENT", () => {
  it("detects display:none, visibility:hidden and opacity:0", () => {
    const issues = issuesOf(fixture("hidden-elements.svg"), "HIDDEN_ELEMENT");
    const ids = issues.map((i) => i.elementId);
    expect(ids).toContain("gone");
    expect(ids).toContain("invisible");
    expect(ids).toContain("faded");
    expect(issues.every((i) => i.severity === "info")).toBe(true);
  });

  it("does not fire for visible elements", () => {
    const issues = issuesOf(fixture("hidden-elements.svg"), "HIDDEN_ELEMENT");
    expect(issues.map((i) => i.elementId)).not.toContain("visible");
  });
});

describe("DUPLICATE_PATH", () => {
  it("detects exact duplicates", () => {
    const issues = issuesOf(fixture("duplicate-path.svg"), "DUPLICATE_PATH");
    expect(issues).toHaveLength(1);
    expect(issues[0].elementId).toBe("path42");
    expect(issues[0].message).toContain("path17");
    expect(issues[0].fixable).toBe(true);
  });

  it("normalizes whitespace and number formatting", () => {
    const svg = `${HEAD}<path d="M 0 0 L 100 0"/><path d="M0 0L100 0"/></svg>`;
    expect(codes(svg)).toContain("DUPLICATE_PATH");
  });

  it("does not fire for distinct paths", () => {
    const svg = `${HEAD}<path d="M 0 0 L 100 0"/><path d="M 0 0 L 50 50"/></svg>`;
    expect(codes(svg)).not.toContain("DUPLICATE_PATH");
  });

  it("reports duplicates with different attributes as not fixable", () => {
    const svg = `${HEAD}<path d="M 0 0 L 100 0" stroke="red"/><path d="M 0 0 L 100 0" stroke="blue"/></svg>`;
    const issues = issuesOf(svg, "DUPLICATE_PATH");
    expect(issues).toHaveLength(1);
    expect(issues[0].fixable).toBe(false);
    expect(issues[0].message).toContain("different attributes");
  });
});

describe("OPEN_PATH", () => {
  it("flags paths without a close command", () => {
    const svg = `${HEAD}<path id="line" d="M 0 0 L 10 10"/></svg>`;
    const issues = issuesOf(svg, "OPEN_PATH");
    expect(issues).toHaveLength(1);
    expect(issues[0].elementId).toBe("line");
    expect(issues[0].fixable).toBe(false);
  });

  it("accepts paths closed with Z or z", () => {
    const svg = `${HEAD}<path d="M 0 0 L 10 10 Z"/><path d="M 0 0 l 5 5 z"/></svg>`;
    expect(codes(svg)).not.toContain("OPEN_PATH");
  });

  it("does not double-report empty paths", () => {
    const svg = `${HEAD}<path d=""/></svg>`;
    expect(codes(svg)).not.toContain("OPEN_PATH");
  });
});

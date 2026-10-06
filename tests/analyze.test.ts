import { describe, expect, it } from "vitest";

import { analyzeSvg } from "../src/validator/analyzeSvg.ts";
import { parseSvg } from "../src/parser/parseSvg.ts";
import { SvgParseError } from "../src/types.ts";
import { fixture } from "./helpers.ts";

describe("parseSvg", () => {
  it("parses a minimal valid SVG", () => {
    const doc = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm"><path d="M 0 0 L 1 1 Z"/></svg>`,
    );
    expect(doc.root).not.toBeNull();
    expect(doc.root!.attributes.width).toBe("10mm");
    expect(doc.elements).toHaveLength(1);
    expect(doc.elements[0].name).toBe("path");
  });

  it("rejects malformed XML", () => {
    expect(() => parseSvg("<svg><path></svg>")).toThrow(SvgParseError);
  });

  it("rejects an empty document", () => {
    expect(() => parseSvg("")).toThrow(SvgParseError);
    expect(() => parseSvg("   ")).toThrow(SvgParseError);
  });

  it("rejects non-SVG roots", () => {
    expect(() => parseSvg("<html><body/></html>")).toThrow(SvgParseError);
  });

  it("rejects multiple root elements", () => {
    expect(() => parseSvg("<svg/><svg/>")).toThrow(SvgParseError);
  });

  it("accepts an XML declaration and keeps elements", () => {
    const doc = parseSvg(
      `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><circle cx="1"/></svg>`,
    );
    expect(doc.elements).toHaveLength(1);
  });
});

describe("analyzeSvg — report shape", () => {
  it("produces a clean report for valid.svg", () => {
    const report = analyzeSvg(fixture("valid.svg"));
    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.width).toBe(100);
    expect(report.height).toBe(80);
    expect(report.units).toBe("mm");
    expect(report.elementCount).toBe(2);
    expect(report.pathCount).toBe(1);
  });

  it("handles an SVG with no attributes at all", () => {
    const report = analyzeSvg(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`);
    expect(report.valid).toBe(true);
    expect(report.elementCount).toBe(0);
    expect(report.issues.map((i) => i.code)).toContain("MISSING_VIEWBOX");
    const vb = report.issues.find((i) => i.code === "MISSING_VIEWBOX")!;
    expect(vb.fixable).toBe(false); // no width/height to derive from
  });

  it("handles nested groups", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10">
      <g id="a"><g id="b"><text id="deep">hi</text></g></g>
    </svg>`;
    const report = analyzeSvg(svg);
    expect(report.issues.map((i) => i.code)).toContain("LIVE_TEXT");
    expect(report.elementCount).toBe(3);
  });

  it("reports multiple simultaneous issues", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <text id="t">x</text>
      <image id="i" href="x.png"/>
      <path id="p1" d="M 0 0 L 1 1"/>
      <path id="p2" d="M 0 0 L 1 1"/>
      <path id="empty" d=""/>
    </svg>`;
    const codes = analyzeSvg(svg).issues.map((i) => i.code);
    expect(codes).toContain("AMBIGUOUS_UNITS");
    expect(codes).toContain("MISSING_VIEWBOX");
    expect(codes).toContain("LIVE_TEXT");
    expect(codes).toContain("RASTER_IMAGE");
    expect(codes).toContain("DUPLICATE_PATH");
    expect(codes).toContain("EMPTY_PATH");
    expect(codes).toContain("OPEN_PATH");
  });
});

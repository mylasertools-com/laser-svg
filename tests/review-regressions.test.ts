import { describe, expect, it } from "vitest";
import { analyzeSvg, fixSvg, parseSvg } from "../src/index.ts";
import { absolutizePathData } from "../src/geometry/pathData.ts";

const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="80mm" viewBox="0 0 100 80">${body}</svg>`;

describe("review regressions", () => {
  it.each([
    ["25.4mm", "2.54cm"],
    ["1in", "72pt"],
    ["96px", "96"],
  ])("preserves the initial coordinate system for %s / %s", (width, height) => {
    const result = fixSvg(
      `<svg width="${width}" height="${height}"><path d="M0 0L96 96Z"/></svg>`,
    );
    const values = parseSvg(result.svg)
      .root!.attributes.viewBox.split(" ")
      .map(Number);
    expect(values[2]).toBeCloseTo(96, 10);
    expect(values[3]).toBeCloseTo(96, 10);
  });
  it("preserves quotes, spacing, entities, PIs, CDATA and explicit closing tags", () => {
    const source = wrap(
      `<?tool preserve?><desc><![CDATA[<svg> > &]]></desc><text data-note = 'a > b'>&#65;</text><path  d = 'M0 0Z'></path>`,
    );
    expect(fixSvg(source).svg).toBe(source);
    const dirty = source.replace("</svg>", '<path id="empty"/></svg>');
    expect(fixSvg(dirty).svg).toBe(source);
  });
  it("does not remove equal paths in different inherited transforms", () => {
    const source = wrap(
      '<g transform="translate(10)"><path d="M0 0L10 10Z"/></g><g transform="translate(50)"><path d="M0 0L10 10Z"/></g>',
    );
    expect(fixSvg(source).svg).toBe(source);
    expect(analyzeSvg(source).issues).toHaveLength(0);
  });
  it.each(["<style>#b{stroke:blue}</style>", '<use href="#b"/>'])(
    "keeps duplicates with external rendering context: %s",
    (context) => {
      const source = wrap(
        `${context}<path id="a" d="M0 0L10 10Z"/><path id="b" d="M0 0L10 10Z"/>`,
      );
      expect(fixSvg(source).svg).toBe(source);
    },
  );
  it("keeps translucent duplicates", () => {
    const source = wrap(
      '<g opacity="0.5"><path d="M0 0L10 10Z"/><path d="M0 0L10 10Z"/></g>',
    );
    expect(fixSvg(source).svg).toBe(source);
  });
  it("does not confuse user IDs and internal references", () => {
    const source = wrap('<path/><path id="el1" d="M0 0L10 10Z"/>');
    expect(fixSvg(source).svg).toBe(wrap('<path id="el1" d="M0 0L10 10Z"/>'));
  });
  it("does not remove an ambiguous duplicate ID", () => {
    const source = wrap('<path id="same"/><path id="same" d="M0 0L10 10Z"/>');
    expect(fixSvg(source).svg).toBe(source);
  });
  it.each([
    ["m10 10 5 5 5 5", "M10 10 L15 15 L20 20"],
    ["M0 0 l10 10 10 10", "M0 0 L10 10 L20 20"],
    ["M0 0 h10 10 v10 10", "M0 0 H10 H20 V10 V20"],
    ["M0 0 q1 1 2 2 1 1 2 2", "M0 0 Q1 1 2 2 Q3 3 4 4"],
  ])("accumulates repeated relative segments: %s", (relative, absolute) => {
    expect(absolutizePathData(relative)).toEqual(absolutizePathData(absolute));
  });
});

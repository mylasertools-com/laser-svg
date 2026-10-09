import { describe, expect, it } from "vitest";

import { fixSvg } from "../src/fixer/fixSvg.ts";
import { analyzeSvg } from "../src/validator/analyzeSvg.ts";
import { fixture } from "./helpers.ts";

describe("fixSvg — duplicate paths", () => {
  it("removes the duplicate and keeps the first copy", () => {
    const result = fixSvg(fixture("duplicate-path.svg"));
    expect(result.fixes.map((f) => f.code)).toContain("DUPLICATE_PATH");
    expect(result.svg).toContain('id="path17"');
    expect(result.svg).not.toContain('id="path42"');
    expect(result.remainingIssues.map((i) => i.code)).not.toContain(
      "DUPLICATE_PATH",
    );
  });

  it("does not touch unrelated elements", () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
  <!-- a comment that must survive -->
  <circle id="keep" cx="5" cy="5" r="2" fill="green"/>
  <path id="first" d="M 0 0 L 10 10"/>
  <path id="second" d="M 0 0 L 10 10"/>
  <rect id="also-keep" x="1" y="1" width="2" height="2"/>
</svg>`;
    const result = fixSvg(source);
    expect(result.svg).toContain("<!-- a comment that must survive -->");
    expect(result.svg).toContain('cx="5"');
    expect(result.svg).toContain('id="keep"');
    expect(result.svg).toContain('id="also-keep"');
    expect(result.svg).toContain('id="first"');
    expect(result.svg).not.toContain('id="second"');
  });
});

describe("fixSvg — empty paths", () => {
  it("removes empty path elements", () => {
    const result = fixSvg(fixture("empty-path.svg"));
    expect(result.fixes.map((f) => f.code)).toContain("EMPTY_PATH");
    expect(result.svg).not.toContain('id="blank"');
    expect(result.svg).not.toContain('id="spaces"');
    expect(result.svg).toContain('id="good"');
    expect(result.remainingIssues.map((i) => i.code)).not.toContain(
      "EMPTY_PATH",
    );
  });
});

describe("fixSvg — viewBox", () => {
  it("adds a viewBox derived from width/height", () => {
    const result = fixSvg(fixture("no-viewbox.svg"));
    expect(result.svg).toContain(
      'viewBox="0 0 377.9527559055118 302.3622047244095"',
    );
    expect(result.fixes.map((f) => f.code)).toContain("MISSING_VIEWBOX");
    expect(result.remainingIssues.map((i) => i.code)).not.toContain(
      "MISSING_VIEWBOX",
    );
  });

  it("does not invent a viewBox without usable dimensions", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="M 0 0 Z"/></svg>`;
    const result = fixSvg(svg);
    expect(result.svg).not.toContain("viewBox");
  });

  it("does not synthesize a viewBox from percentage dimensions", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="50%" height="60%"><path d="M 0 0 Z"/></svg>`;
    const result = fixSvg(svg);
    expect(result.svg).not.toContain("viewBox");
    const vb = result.remainingIssues.find((i) => i.code === "MISSING_VIEWBOX");
    expect(vb?.fixable).toBe(false);
  });

  it("leaves an existing viewBox alone", () => {
    const result = fixSvg(fixture("valid.svg"));
    expect(result.svg).toContain('viewBox="0 0 100 80"');
    expect(result.fixes).toHaveLength(0);
  });
});

describe("fixSvg — document structure", () => {
  it("preserves comments and PIs before and after the root element", () => {
    const source = `<?xml version="1.0"?>
<!-- lead comment -->
<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10">
  <path d="M 0 0 L 5 5"/>
  <path d="M 0 0 L 5 5"/>
</svg>
<!-- trail comment -->
<?pi data?>
`;
    const result = fixSvg(source);
    expect(result.svg).toContain("<!-- lead comment -->");
    expect(result.svg).toContain("<!-- trail comment -->");
    expect(result.svg).toContain("<?pi data?>");
    expect(result.svg).toContain('<?xml version="1.0"?>');
    // and the fix actually happened
    expect(result.fixes.map((f) => f.code)).toContain("DUPLICATE_PATH");
  });

  it("preserves a DOCTYPE declaration", () => {
    const source = `<?xml version="1.0"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path d="M 0 0 Z"/></svg>`;
    const result = fixSvg(source);
    expect(result.svg).toContain("<!DOCTYPE svg PUBLIC");
  });

  it("does not remove duplicates that differ in presentation attributes", () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10">
  <path d="M 0 0 L 5 5 Z" stroke="red"/>
  <path d="M 0 0 L 5 5 Z" stroke="blue"/>
</svg>`;
    const result = fixSvg(source);
    expect(result.fixes).toHaveLength(0);
    expect(result.svg).toContain('stroke="red"');
    expect(result.svg).toContain('stroke="blue"');
    expect(result.remainingIssues.map((i) => i.code)).toContain(
      "DUPLICATE_PATH",
    );
  });
});

describe("fixSvg — hidden elements", () => {
  it("keeps hidden elements by default", () => {
    const result = fixSvg(fixture("hidden-elements.svg"));
    expect(result.svg).toContain('id="gone"');
    expect(result.svg).toContain('id="invisible"');
  });

  it("removes hidden elements with removeHidden: true", () => {
    const result = fixSvg(fixture("hidden-elements.svg"), {
      removeHidden: true,
    });
    expect(result.svg).not.toContain('id="gone"');
    expect(result.svg).not.toContain('id="invisible"'); // group removed with children
    expect(result.svg).not.toContain('id="inside"');
    expect(result.svg).not.toContain('id="faded"');
    expect(result.svg).toContain('id="visible"');
  });
});

describe("fixSvg — safety", () => {
  it("never modifies geometry or closes open paths", () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10">
  <path id="open" d="M 0 0 L 5 5"/>
</svg>`;
    const result = fixSvg(source);
    expect(result.svg).toContain('d="M 0 0 L 5 5"');
    expect(result.fixes).toHaveLength(0);
    expect(result.remainingIssues.map((i) => i.code)).toContain("OPEN_PATH");
  });

  it("never guesses physical units", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"/>`;
    const result = fixSvg(svg);
    expect(result.svg).toContain('width="100"');
    expect(result.remainingIssues.map((i) => i.code)).toContain(
      "AMBIGUOUS_UNITS",
    );
  });

  it("fixing twice is a no-op (idempotent)", () => {
    const once = fixSvg(fixture("duplicate-path.svg"));
    const twice = fixSvg(once.svg);
    expect(twice.svg).toBe(once.svg);
    expect(twice.fixes).toHaveLength(0);
  });

  it("leaves a valid file byte-identical", () => {
    const source = fixture("valid.svg");
    const result = fixSvg(source);
    expect(result.svg).toBe(source);
  });

  it("output of fix is parseable and reports fewer issues", () => {
    const result = fixSvg(fixture("empty-path.svg"));
    const after = analyzeSvg(result.svg);
    expect(after.valid).toBe(true);
    expect(after.issues.length).toBeLessThan(
      analyzeSvg(fixture("empty-path.svg")).issues.length,
    );
  });
});

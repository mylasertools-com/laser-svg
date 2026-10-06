# Laser SVG

Validate and fix SVG files for common laser-cutting problems — from the CLI or from TypeScript.

Laser SVG is an open-source project by MyLaserTools.

Website: [https://mylasertools.com](https://mylasertools.com)

## What it does

Design tools export SVGs that laser cutters and their software handle badly: missing `viewBox`es, unitless sizes, live text, duplicated paths, hidden layers. `laser-svg check` reports these problems with stable issue codes; `laser-svg fix` repairs the ones that can be repaired safely, and never touches geometry.

## Installation

```bash
npm install --save-dev laser-svg
```

Or run it without installing:

```bash
npx laser-svg check design.svg
```

Requires Node.js 20+.

## CLI

```bash
laser-svg check input.svg          # report problems
laser-svg check input.svg --json   # machine-readable report
laser-svg check input.svg --duplicate-tolerance 0.01
laser-svg fix input.svg -o fixed.svg
laser-svg fix input.svg --remove-hidden
```

Example output:

```text
Laser SVG Validator

File: design.svg
Size: 300 × 200 mm

✓ Dimensions valid
✓ ViewBox present

Warnings:
  LIVE_TEXT
    Text element #title has not been converted to paths.

  DUPLICATE_PATH
    Path #path42 duplicates #path17.

Summary:
  2 warnings
  0 errors
```

Exit codes:

| Code | Meaning                                 |
| ---- | --------------------------------------- |
| `0`  | no errors (warnings alone still exit 0) |
| `1`  | the SVG contains validation errors      |
| `2`  | file / parser / CLI failure             |

`check --json` prints only the JSON report, suitable for CI.

## TypeScript API

```ts
import { analyzeSvg, fixSvg } from "laser-svg";

const report = await analyzeSvg(svgString);
// { valid, width, height, units, elementCount, pathCount, issues: [...] }

const result = await fixSvg(svgString);
// { svg, fixes: [...], remainingIssues: [...] }
```

Each issue has a stable `code`, a `severity` (`error` | `warning` | `info`), a human-readable `message`, optional `elementId` / `elementType`, and a `fixable` flag:

```json
{
  "code": "OPEN_PATH",
  "severity": "warning",
  "message": "Path #outline may be open (no closepath command).",
  "elementId": "outline",
  "elementType": "path",
  "fixable": false
}
```

`fixSvg(svg, options)` accepts `{ removeHidden?: boolean }` (default `false`).

Both functions accept analysis options:

```ts
const report = analyzeSvg(svg, {
  duplicateTolerance: 0.01, // default; 0 disables near-duplicate matching
});
```

`duplicateTolerance` is in SVG user units; a path pair whose absolutized
coordinates all differ by at most that amount is reported as
`NEAR_DUPLICATE_PATH`. Invalid values (negative, non-finite) throw
`RangeError`.

## Validation rules

| Code                  | Severity | Fixable                          | Detects                                                                          |
| --------------------- | -------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `MISSING_VIEWBOX`     | warning  | yes, if width/height are usable  | root `<svg>` without `viewBox`                                                   |
| `AMBIGUOUS_UNITS`     | warning  | no                               | unitless or `%` root dimensions (mm/cm/in/pt/px are accepted)                    |
| `INVALID_DIMENSIONS`  | error    | no                               | width/height ≤ 0 or malformed                                                    |
| `LIVE_TEXT`           | warning  | no                               | `<text>` / `<tspan>`                                                             |
| `RASTER_IMAGE`        | info     | no                               | `<image>`                                                                        |
| `FILTER_PRESENT`      | warning  | no                               | `<filter>`                                                                       |
| `MASK_PRESENT`        | warning  | no                               | `<mask>`                                                                         |
| `CLIP_PATH_PRESENT`   | warning  | no                               | `<clipPath>`                                                                     |
| `PATTERN_PRESENT`     | warning  | no                               | `<pattern>`                                                                      |
| `EMPTY_PATH`          | warning  | yes                              | `<path>` with no usable `d`                                                      |
| `HIDDEN_ELEMENT`      | info     | yes (opt-in)                     | `display:none`, `visibility:hidden`, `opacity:0`                                 |
| `DUPLICATE_PATH`      | warning  | yes, if attributes are identical | two paths with identical normalized `d`                                          |
| `NEAR_DUPLICATE_PATH` | warning  | no                               | paths within `duplicateTolerance` user units after absolutization (default 0.01) |
| `OPEN_PATH`           | warning  | no                               | path data with no `Z`/`z` close command                                          |

## What `fix` changes

By default:

- removes empty paths,
- removes exact duplicate paths (keeps the first copy) when the two paths
  are identical apart from `id` — duplicates with different presentation
  attributes are reported but kept, because removing one would change the
  render,
- adds a `viewBox` when the root width/height make it unambiguous (never
  from percentage dimensions).

With `--remove-hidden` / `removeHidden: true`, it also removes obviously hidden elements.

Everything else — whitespace, attribute order, comments, unrelated elements — is preserved byte-for-byte. The fixer never modifies geometry, never guesses physical units, and never closes open paths. Run `fix` twice and the second run is a no-op.

## Limitations

- **`OPEN_PATH` produces false positives.** v1 checks only whether the path data contains a close command; genuinely open cut lines and engrave strokes are also flagged. This is deliberate — auto-closing could silently change a cut.
- **Duplicate detection is command-level, not geometric.** Exact matching
  compares normalized path syntax; near matching compares absolutized
  command parameters within `duplicateTolerance`. Reversed geometry,
  different starting points, `<rect>` vs `<path>`, and reparameterized
  curves are not recognized as duplicates.
- **No geometry engine.** No kerf compensation, path offsets, boolean operations, self-intersection detection, endpoint snapping, or minimum-feature-width checks — planned for later versions.
- **No font conversion.** Live text is reported, not outlined.
- Filters, masks, clip paths and patterns are reported but not flattened.

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsc -> dist/
```

Architecture notes:

- Each rule is an independent `ValidationRule` (`run(document) => LaserSvgIssue[]`) in `src/validator/rules/`; add a file, export a rule, register it in `defaultRules`.
- XML is parsed with `fast-xml-parser` (preserve-order mode), never regex. The parser keeps source order so the fixer can re-serialize untouched content verbatim.
- Geometry helpers live in `src/geometry/` with no dependencies, so they can move into a separate `laser-geometry` package later.

## Contributing

Issues and pull requests are welcome at
[github.com/mylasertools-com/laser-svg](https://github.com/mylasertools-com/laser-svg).

- New rules need a stable `code`, at least one positive and one negative test, and a row in the rules table above.
- Anything that changes geometry is out of scope for the fixer unless it is provably lossless.
- Run `npm test` and `npm run build` before opening a PR.

MIT licensed.

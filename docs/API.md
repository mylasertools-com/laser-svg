# API reference

The package exports ESM with TypeScript declarations. Node.js 20+ is required for the CLI. Bundle the library entry point for browsers; it has no Node.js imports. `commander` is used only by the CLI; `fast-xml-parser` is a runtime dependency of the library.

## `analyzeSvg(source, options?)`

Synchronous. Returns `{ valid, width?, height?, units?, elementCount, pathCount, issues }`.

- `valid` means no **error-severity** issues; warnings do not make it false.
- `width` and `height` are numeric root attribute values, not normalized millimetres. `units` is present only when both have the same explicit accepted unit.
- `elementCount` excludes the root; `pathCount` counts path elements.
- Each issue contains `code`, `severity`, `message`, `fixable`, and optional `elementId` / `elementType`. Missing element IDs use deterministic internal references. Duplicate user IDs are ambiguous and are not used for automatic element removal.

```ts
const report = analyzeSvg(source, { duplicateTolerance: 0.01 });
const needsInspection = report.issues.length > 0;
```

`duplicateTolerance` defaults to `0.01` SVG user units. `0` disables near matching. Negative or non-finite values throw `RangeError`. Matching compares absolutized command parameters only within the same parent and transform; it is not a geometric overlap solver.

## `fixSvg(source, options?)`

Synchronous. Accepts the analysis options plus `removeHidden?: boolean` (default `false`). Returns `{ svg, fixes, remainingIssues }`. `fixes` lists the issues actually repaired; inspect `remainingIssues` even when fixes were applied.

```ts
const result = fixSvg(source, {
  removeHidden: false,
  duplicateTolerance: 0.01,
});
```

The fixer removes empty paths, eligible exact sibling duplicates, and opt-in hidden elements. It adds a missing viewBox using root width/height converted to CSS pixels at 96 px/in. For example, 25.4 mm is 96 initial user units. Root physical dimensions and all retained path coordinates stay unchanged. See the [SVG coordinate specification](https://www.w3.org/TR/SVG2/coords.html#Units).

Duplicate removal is intentionally conservative around CSS, references, transforms and compositing. Near duplicates are never removed. Whitespace, quote styles, character references, comments, processing instructions, and unchanged tags are preserved in the original source. A second fix pass is a no-op for the supported repairs.

Both entry points throw `SvgParseError` for malformed XML, a non-SVG root, multiple roots, or entity-expanded markup that cannot be mapped safely to its source. They do not sanitize active SVG content. Use an image context or an appropriate sanitizer when displaying untrusted SVGs in a web app.

## Advanced exports

`parseSvg` returns the internal ordered document model, and `defaultRules` exposes the current rules. `ValidationRule` describes a rule's `run(document, options)` method. These model APIs support inspection; the high-level fixer owns source editing. See [`src/types.ts`](../src/types.ts) for the full types and the [README rule table](../README.md#validation-rules) for codes.

## CLI

```sh
laser-svg check input.svg --json
laser-svg check input.svg --duplicate-tolerance 0.001
laser-svg fix input.svg -o fixed.svg --remove-hidden --json
```

`check` exits 0 with no errors, 1 for error-level validation findings, and 2 for CLI/file/parser failures. `fix` exits 0 after writing, even if issues remain. Without `-o`, it overwrites the input. With `--json`, fix output includes the SVG, fixes and remaining issues. The CLI's tolerance option currently belongs to `check`; configure tolerance through the API when fixing.

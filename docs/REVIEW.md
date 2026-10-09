# Package review

Reviewed 2026-10-09. This records the issues reproduced and fixed while adding the workbench; it is not an exhaustive SVG or manufacturing audit.

| Finding                                       | Impact before this change                                                                         | Resolution                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Physical lengths copied directly into viewBox | A 25.4 mm viewport became 25.4 user units instead of 96, changing geometry scale                  | Convert accepted absolute units to CSS pixels; unit and real-browser rendering regressions |
| Duplicate paths compared across parents       | Identical local path data in differently translated groups could cause a part to disappear        | Compare only the same parent/transform; retain recognized CSS/reference/compositing cases  |
| Repeated relative path segments               | Every implicit segment reused the first segment's origin, causing incorrect near matches          | Update the current point for each segment; cover lines, axes, moveto and curves            |
| Whole-tree reserialization                    | No-op fixes changed quotes, entities and closing tags; internal processing instructions were lost | Edit original source spans and preserve unrelated bytes                                    |
| User IDs collided with internal references    | An empty path issue could target another, nonempty path                                           | Disjoint internal references and conservative handling of duplicate IDs                    |
| Unix-only build                               | `chmod` failed on Windows before tests could run                                                  | Use Node's filesystem API                                                                  |
| Outdated dependencies                         | npm audit reported seven dependency findings                                                      | Update parser and development dependencies; audited install reports zero findings          |

## Validation

- 100 unit and CLI tests, including the new review regressions.
- 18 browser cases: six flows in Chromium, Firefox and WebKit. Covers sample fixes, SVG/JSON downloads, tolerance, manual-only findings, physical-scale preservation, malformed-input recovery, local uploads, non-executing image previews, size limits and mobile layout.
- Isolated npm tarball consumer: imports the installed ESM API and invokes the installed CLI. The tarball excludes the demo and capture assets.
- Desktop and mobile screenshots inspected; both README GIFs captured from actual demo interactions.

Browser rasterizers round physical lengths differently, so the viewBox rendering test allows a one-pixel bound difference and 2% coverage difference. It detects scale changes rather than comparing compressed PNG bytes.

## Remaining limits

The validator does not implement the entire SVG renderer or CSS cascade. Duplicate detection is conservative and command-level, with no cross-parent transform resolution. Open-path detection only checks for a close command anywhere in the path; mixed open/closed compound paths need manual inspection. Hidden removal is opt-in and may remove intentional content or a hidden group whose child overrides visibility. Percentage/CSS-driven dimensions and advanced rendering features need manual review. Reference handling does not make this a general SVG sanitizer.

The demo displays SVG through an image element, never page markup, and runs analysis in a disposable worker with a 1 MB limit and five-second timeout. Library callers should impose their own resource limits for untrusted or very large input; near-duplicate matching can be quadratic. No kerf, machine, material-strength, font outlining, boolean geometry or physical cutting validation is claimed.

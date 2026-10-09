# Changelog

## Unreleased

- Add the local browser workbench, five examples, reproducible GIF captures, API docs and GitHub Pages deployment.
- Preserve the CSS-pixel coordinate scale when adding a viewBox to physical dimensions.
- Compare duplicate paths only within the same parent and transform; preserve paths affected by recognized references, stylesheets, animation or compositing.
- Accumulate repeated relative path commands correctly during near-duplicate matching; reject non-finite path numbers.
- Apply fixes to original source spans to preserve quotes, whitespace, entities, processing instructions and closing-tag style.
- Keep fallback element references separate from user IDs and avoid removal using ambiguous IDs.
- Make the build portable to Windows. Upgrade the XML parser and test dependencies to patched versions.

These changes are on `main` and in the live demo. They have not been published to npm; the current package release remains 0.1.0.

## 0.1.0

Initial validator, fixer, TypeScript API, CLI, and near-duplicate reporting.

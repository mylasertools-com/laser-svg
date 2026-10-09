# Contributing

Use a current Node.js 22 or 24 release and `npm ci`. The published library and CLI support Node.js 20+; newer developer tools may require a current Node patch release.

```sh
npm run check
npm run test:package
npx playwright install chromium firefox webkit
npm run test:browser
```

New validation rules need a stable issue code, positive and negative tests, and a README rule-table entry. Keep automatic repairs conservative: do not close paths, outline text, guess physical dimensions, or remove near duplicates.

## Workbench and assets

`npm run demo` builds a self-contained static site and serves it at `http://127.0.0.1:4179/demo/`. Edit `demo/`, `examples/` or `src/`, then restart the command to rebuild. The worker bundles the actual package entry point. The demo has no CDN scripts, remote fonts, analytics or upload endpoint.

`npm run capture` needs Chromium (`npx playwright install chromium`) and `ffmpeg` on PATH. It starts a temporary server on port 4181, drives actual workbench controls, and regenerates `docs/assets/workbench.png`, `cleanup.gif`, and `tolerance.gif`. Intermediate frames and the mobile screenshot remain ignored in `qa-dist/`. Do not replace the GIFs with invented output or claim that unchanged previews prove manufacturing safety.

## Deployment

Enable GitHub Pages with GitHub Actions as its source. After CI succeeds for a push to `main`, the Pages workflow checks out that exact commit, runs `npm ci` and `npm run build:site`, and publishes **only** `site/`. The public URL is `https://mylasertools-com.github.io/laser-svg/demo/`. Repository source, dependencies and test output are not part of that site artifact.

The package tarball contains `dist`, README and LICENSE. The browser demo and GIFs are repository/site assets, not installed runtime code. A separate versioned npm release is needed to publish the unreleased package fixes.

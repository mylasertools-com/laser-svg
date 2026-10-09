import { build } from "esbuild";
import { cp, mkdir, writeFile } from "node:fs/promises";
await mkdir("site/demo", { recursive: true });
await build({
  entryPoints: ["demo/app.js", "demo/worker.js"],
  outdir: "site/demo",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  loader: { ".svg": "text" },
  legalComments: "eof",
});
for (const name of ["index.html", "style.css", "favicon.svg"])
  await cp(`demo/${name}`, `site/demo/${name}`);
await cp("examples", "site/examples", { recursive: true });
await writeFile("site/.nojekyll", "");
await writeFile(
  "site/index.html",
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./demo/"><title>Laser SVG</title><a href="./demo/">Open the Laser SVG workbench</a></html>',
);
console.log("Built the self-contained workbench in site/demo/.");

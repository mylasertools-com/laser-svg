import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const npm = process.env.npm_execpath;
const run = (args, cwd = process.cwd()) =>
  execFileSync(process.execPath, [npm, ...args], { cwd, encoding: "utf8" });
run(["run", "build"]);
mkdirSync("qa-dist", { recursive: true });
const [packed] = JSON.parse(
  run(["pack", "--json", "--ignore-scripts", "--pack-destination", "qa-dist"]),
);
assert(!packed.files.some((f) => /^(demo|site|qa-dist)\//.test(f.path)));
const dir = mkdtempSync(resolve("qa-dist/consumer-"));
writeFileSync(
  resolve(dir, "package.json"),
  JSON.stringify({ private: true, type: "module" }),
);
run(
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    resolve("qa-dist", packed.filename),
  ],
  dir,
);
const consumer = `import { analyzeSvg, fixSvg } from '@mylasertools/laser-svg';
import assert from 'node:assert/strict';
const svg = '<svg width="10mm" height="10mm" viewBox="0 0 10 10"><path d=""/></svg>';
assert.equal(analyzeSvg(svg).issues[0].code, 'EMPTY_PATH');
assert.equal(fixSvg(svg).fixes.length, 1);
console.log('Packed ESM API passed');`;
writeFileSync(resolve(dir, "consumer.mjs"), consumer);
console.log(
  execFileSync(process.execPath, ["consumer.mjs"], {
    cwd: dir,
    encoding: "utf8",
  }).trim(),
);
const version = execFileSync(
  process.execPath,
  [
    resolve(dir, "node_modules/@mylasertools/laser-svg/dist/cli/index.js"),
    "--version",
  ],
  { encoding: "utf8" },
).trim();
assert.equal(version, "0.1.0");
console.log(
  `Packed CLI passed; ${packed.files.length} files, ${packed.size} bytes.`,
);

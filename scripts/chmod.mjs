import { chmodSync } from "node:fs";
chmodSync("dist/cli/index.js", 0o755);

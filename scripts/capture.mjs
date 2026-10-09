import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
await mkdir("docs/assets", { recursive: true });
await mkdir("qa-dist/frames", { recursive: true });
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4181" },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "error").then(([e]) => Promise.reject(e)),
  ]);
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1030 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4181/demo/");
  await page.locator("#apply").waitFor({ state: "visible" });
  const ready = () =>
    page.waitForFunction(() => !document.getElementById("apply").disabled);
  const frame = async (name, i) => {
    await page.locator("#preview").evaluate((img) => img.decode());
    await page.locator("#workspace").screenshot({
      path: `qa-dist/frames/${name}-${String(i).padStart(2, "0")}.png`,
    });
  };
  await ready();
  await page.screenshot({ path: "docs/assets/workbench.png", fullPage: true });
  await frame("cleanup", 0);
  await page.locator("#remove-hidden").check();
  await ready();
  await frame("cleanup", 1);
  await page.locator("#apply").click();
  await frame("cleanup", 2);
  await frame("cleanup", 3);
  await page.locator("#view-original").click();
  await frame("cleanup", 4);
  await page.locator('[data-example="near-duplicates"]').click();
  await ready();
  await frame("tolerance", 0);
  await page.locator("#tolerance").fill("0.001");
  await ready();
  await frame("tolerance", 1);
  await page.locator("#tolerance").fill("0.01");
  await ready();
  await frame("tolerance", 2);
  await page.locator('[data-example="cleanup"]').click();
  await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "qa-dist/mobile.png", fullPage: true });
  if (errors.length) throw Error(errors.join("\n"));
  for (const name of ["cleanup", "tolerance"]) {
    const result = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-framerate",
        "0.6",
        "-i",
        `qa-dist/frames/${name}-%02d.png`,
        "-filter_complex",
        "[0:v]scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer",
        "-loop",
        "0",
        `docs/assets/${name}.gif`,
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0)
      throw Error(result.stderr || "Install ffmpeg to capture GIFs.");
  }
  console.log("Captured actual workbench output in docs/assets.");
} finally {
  await browser?.close();
  server.kill();
}

import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { analyzeSvg } from "../../dist/index.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/demo/");
  await expect(page.locator("#apply")).toBeEnabled();
});

test("fixes real examples, preserves original, downloads usable SVG and JSON", async ({
  page,
}) => {
  await expect(page.locator("#issue-count")).toHaveText("3");
  const source = await page.locator("#source").inputValue();
  await page.locator("#remove-hidden").check();
  await expect(page.locator("#apply")).toHaveText("Apply 3 fixes ↗");
  await page.locator("#apply").click();
  await expect(page.locator("#issue-count")).toHaveText("0");
  expect(await page.locator("#source").inputValue()).toBe(source);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#download").click(),
  ]);
  const svg = await readFile(await download.path(), "utf8");
  expect(analyzeSvg(svg).issues).toHaveLength(0);
  expect(svg).not.toContain('id="tag-copy"');
  expect(download.suggestedFilename()).toBe("cleanup.fixed.svg");
  const [reportDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#report-download").click(),
  ]);
  const report = JSON.parse(
    await readFile(await reportDownload.path(), "utf8"),
  );
  expect(report.fixes).toHaveLength(3);
  expect(report.after.issues).toHaveLength(0);
  await page.locator("#view-original").click();
  await expect(page.locator("#issue-count")).toHaveText("3");
});

test("near duplicate threshold and manual-only examples", async ({ page }) => {
  await page.locator('[data-example="near-duplicates"]').click();
  await expect(page.locator("#issues")).toContainText("NEAR_DUPLICATE_PATH");
  await page.locator("#tolerance").fill("0.001");
  await expect(page.locator("#issue-count")).toHaveText("0");
  await page.locator('[data-example="live-text"]').click();
  await expect(page.locator("#issues")).toContainText("LIVE_TEXT");
  await expect(page.locator("#issues")).toContainText("OPEN_PATH");
  await expect(page.locator("#fix-count")).toHaveText("0");
});

test("adding a viewBox keeps rendered physical scale", async ({ page }) => {
  await page.locator('[data-example="missing-viewbox"]').click();
  await expect(page.locator("#apply")).toHaveText("Apply 1 fixes ↗");
  const pixels = () =>
    page.locator("#preview").evaluate(async (img) => {
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 320;
      canvas.getContext("2d").drawImage(img, 0, 0, 480, 320);
      const pixels = canvas.getContext("2d").getImageData(0, 0, 480, 320).data;
      let minX = 480,
        maxX = -1,
        minY = 320,
        maxY = -1,
        count = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] <= 50) continue;
        const x = ((i - 3) / 4) % 480,
          y = Math.floor((i - 3) / 4 / 480);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        count++;
      }
      return { minX, maxX, minY, maxY, count };
    });
  const before = await pixels();
  await page.locator("#apply").click();
  const after = await pixels();
  // SVG image rasterizers round fractional physical units differently once
  // a viewBox exists. Permit one pixel, never a change of physical scale.
  for (const key of ["minX", "maxX", "minY", "maxY"])
    expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(1);
  expect(Math.abs(after.count / before.count - 1)).toBeLessThan(0.02);
  await expect(page.locator("#issue-count")).toHaveText("0");
});

test("malformed edits clear stale output and recover", async ({ page }) => {
  await page.locator("#apply").click();
  await page.locator("#source").fill("<svg><broken>");
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#download")).toBeDisabled();
  await expect(page.locator("#output")).toHaveValue("");
  await page.locator('[data-example="clean"]').click();
  await expect(page.locator("#issue-count")).toHaveText("0");
  await expect(page.locator("#error")).toBeHidden();
});

test("uploads are local and SVG scripts/resources never run in the page", async ({
  page,
}) => {
  const external = [];
  page.on("request", (req) => {
    if (
      /^https?:/.test(req.url()) &&
      !req.url().startsWith("http://127.0.0.1:4179/")
    )
      external.push(req.url());
  });
  await page.locator("#file").setInputFiles({
    name: "local.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="80mm" viewBox="0 0 100 80" onload="window.__svgExecuted=true"><script>window.__svgExecuted=true</script><image href="https://example.com/should-not-load.png"/><path d="M0 0L20 20Z"/></svg>',
    ),
  });
  await expect(page.locator("#filename")).toHaveText("local.svg");
  await expect(page.locator("#issues")).toContainText("RASTER_IMAGE");
  await page
    .locator("#preview")
    .evaluate((img) => img.decode().catch(() => {}));
  expect(await page.evaluate(() => window.__svgExecuted)).toBeUndefined();
  expect(external).toEqual([]);
  await page.locator("#file").setInputFiles({
    name: "large.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.alloc(1024 * 1024 + 1, " "),
  });
  await expect(page.locator("#error")).toContainText("smaller than 1 MB");
});

test("mobile layout stays within viewport and supports fixing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.locator("#apply").click();
  await expect(page.locator("#download")).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

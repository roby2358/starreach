// Screenshot a page in headless Chromium, e.g. a live viewer for the home page.
// Waits for the viewer to go live when the page is a viewer, then a moment for the hologram to settle.
// The format follows the file extension (.png or .jpg).
//
//   node tools/screenshot.ts <url> <out file> <width> <height>

import { chromium } from "playwright-core";

const USAGE = "usage: screenshot.ts <url> <out file> <width> <height>";
const SETTLE_MS = 1500;
const JPEG_QUALITY = 85;

async function main(args: string[]): Promise<void> {
  if (args.length !== 4) {
    throw new Error(USAGE);
  }
  const [url, out, width, height] = args;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
    await page.goto(url, { waitUntil: "networkidle" });
    if (url.includes("view=")) {
      await page.waitForSelector("body[data-link=live]");
    }
    await page.waitForTimeout(SETTLE_MS);
    const quality = out.endsWith(".jpg") ? JPEG_QUALITY : undefined;
    await page.screenshot({ path: out, quality });
    console.log(`wrote ${out}`);
  } finally {
    await browser.close();
  }
}

main(process.argv.slice(2)).catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});

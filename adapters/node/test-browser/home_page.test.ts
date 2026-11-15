// U-12: the home page in a real browser, against the real server.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chromium, type Browser } from "playwright-core";

import { startServer, stopServer, type Running } from "../test/helpers/server.ts";

let running: Running;
let browser: Browser;

// The browser launches first: if it can't, no server is left holding the process open.
before(async () => {
  browser = await chromium.launch();
  running = await startServer();
});

after(async () => {
  await browser?.close();
  if (running !== undefined) {
    await stopServer(running);
  }
});

test("U-12: the home page shows the briefing", async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
  await page.goto(`${running.base}/`);
  assert.match((await page.locator(".ask").textContent())!, /Ask the computer/);
  assert.ok((await page.locator("body").textContent())!.includes("https://starreach.yuwakisa.com/mcp"));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal scroll");
  await page.close();
});

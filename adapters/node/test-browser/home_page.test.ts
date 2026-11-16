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
  assert.match((await page.locator(".ask").textContent())!, /What can you do\?/);
  assert.ok((await page.locator("body").textContent())!.includes("https://starreach.yuwakisa.com/mcp"));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal scroll");
  await page.close();
});

test("U-12: the home page says what is recorded, and claims no more", async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
  await page.goto(`${running.base}/`);
  const records = (await page.locator(".records").textContent())!.replaceAll(/\s+/g, " ");
  assert.ok(await page.locator(".records").isVisible());
  assert.ok(records.includes("the commands played and how each game ends"), "what is recorded");
  assert.ok(records.includes("to tune the game"), "what it is for");
  assert.ok(records.includes("counted by a one-way hash, not by name"), "how players are counted");
  assert.ok(records.includes("No name, no Bluesky identity and nothing of your conversation is recorded"), "what is not recorded");
  assert.doesNotMatch((await page.locator("body").textContent())!, /anonym|traced|untraceable/i);
  await page.close();
});

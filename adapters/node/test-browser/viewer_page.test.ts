// U-1, U-2, U-8, U-9, U-10: the real page in a real browser, against the real server, while commands run.
// A screenshot of the page goes to test-browser/out/ to look at.

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { newGame, runCommand } from "@starreach/app";
import { chromium, type Browser, type Page } from "playwright-core";

import { startServer, stopServer, type Running } from "../test/helpers/server.ts";

const OUT = fileURLToPath(new URL("./out/", import.meta.url));

let running: Running;
let browser: Browser;

// The browser launches first: if it can't, no server is left holding the process open.
before(async () => {
  browser = await chromium.launch();
  running = await startServer();
  mkdirSync(OUT, { recursive: true });
});

after(async () => {
  await browser?.close();
  if (running !== undefined) {
    await stopServer(running);
  }
});

async function openGame(gameId: string, viewport: { width: number; height: number }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  await page.goto(`${running.base}/?game=${gameId}`);
  await page.waitForSelector("body[data-link=live]");
  return page;
}

async function gameId(): Promise<string> {
  return (await newGame(running.deps)).report!.game_id as string;
}

test("U-1: the map is a labelled 10x10 grid: charted sectors filled, the rest hidden, and the ship's sector marked", async () => {
  const id = await gameId();
  const page = await openGame(id, { width: 1100, height: 800 });
  assert.equal(await page.locator(".sector").count(), 100);
  assert.equal(await page.locator("#galaxy .axis").count(), 21);
  assert.equal(await page.locator(".sector:not(.hidden)").count(), 1);
  assert.equal(await page.locator("#sector").textContent(), "(4, 4)");

  const scan = await runCommand(running.deps, id, { type: "long_range_scan" });
  await page.waitForFunction(() => document.querySelectorAll(".sector:not(.hidden)").length === 9);
  const [first] = (scan.report as { scan: string[] }).scan[0].split(" ");
  const label = await page.locator(".sector").nth(3 * 10 + 3).getAttribute("aria-label");
  const [enemies, bases, stars] = first.split("|");
  assert.equal(label, `Sector 3,3: ${enemies} enemies, ${bases} starbases, ${stars} stars`);

  await runCommand(running.deps, id, { type: "galaxy_warp", y: 3, x: 3 });
  await page.waitForFunction(() => document.querySelector("#sector")!.textContent === "(3, 3)");
  await page.click("#tab-galaxy");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}desktop-galaxy.png` });
  await page.close();
});

test("U-2: the ship's status follows the game, and nothing goes back up the socket", async () => {
  const id = await gameId();
  const sent: unknown[] = [];
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on("websocket", (socket) => socket.on("framesent", (frame) => sent.push(frame)));
  await page.goto(`${running.base}/?game=${id}`);
  await page.waitForSelector("body[data-link=live]");
  const energy = page.locator("[data-gauge=energy] .gauge-value");
  assert.match((await energy.textContent())!, /^(\d+) \/ \1$/);
  await page.click("#tab-galaxy");

  const { state } = await runCommand(running.deps, id, { type: "long_range_scan" });
  await page.waitForFunction(
    (expected) => document.querySelector("[data-gauge=energy] .gauge-value")!.textContent === expected,
    `${state!.ship_energy} / ${state!.ship_max_energy}`,
  );
  assert.equal(await page.locator("[data-gauge=hull] .gauge-value").textContent(), `${state!.ship_hull} / ${state!.ship_max_hull}`);
  assert.deepEqual(sent, []);
  await page.close();
});

test("U-8: the survey panel totals what has been charted", async () => {
  const id = await gameId();
  const page = await openGame(id, { width: 1100, height: 800 });
  assert.equal(await page.locator("#charted").textContent(), "1 / 100");
  assert.equal(await page.locator("#sighted").textContent(), "0");
  assert.equal(await page.locator("#bases").textContent(), "1");

  const { report } = await runCommand(running.deps, id, { type: "long_range_scan" });
  await page.waitForFunction(() => document.querySelector("#charted")!.textContent === "9 / 100");
  const sectors = (report as { scan: string[] }).scan.join(" ").split(" ").map((s) => s.split("|").map(Number));
  const total = (field: number) => String(sectors.reduce((sum, sector) => sum + sector[field], 0));
  assert.equal(await page.locator("#sighted").textContent(), total(0));
  assert.equal(await page.locator("#bases").textContent(), total(1));
  await page.close();
});

const OCCUPANT_CLASSES: Record<string, string> = { ".": "", S: "ship", E: "enemy", B: "starbase", "*": "star" };

/** Waits until the board draws exactly this map. */
async function waitForBoard(page: Page, map: string[]): Promise<void> {
  const expected = map.join("").split("").map((character) => OCCUPANT_CLASSES[character]);
  await page.waitForFunction(
    (classes) => [...document.querySelectorAll("#board .cell")].map((cell) => cell.firstElementChild?.className ?? "").join() === classes.join(),
    expected,
  );
}

test("U-9: the board shows the ship's sector, following warps and moves", async () => {
  const id = await gameId();
  const page = await openGame(id, { width: 1100, height: 800 });
  assert.equal(await page.locator("#board .cell").count(), 100);
  assert.equal(await page.locator("#board .axis").count(), 21);
  const { state: start } = await runCommand(running.deps, id, { type: "state" });
  await waitForBoard(page, start!.map as string[]);

  const [y, x] = start!.ship_yx as [number, number];
  const y2 = y === 0 ? 1 : y - 1;
  const x2 = [x - 1, x, x + 1].find((c) => (start!.map as string[])[y2]?.[c] === ".")!;
  const { state: moved } = await runCommand(running.deps, id, { type: "subwarp", y: y2, x: x2 });
  assert.deepEqual(moved!.ship_yx, [y2, x2]);
  await waitForBoard(page, moved!.map as string[]);

  const { state: warped } = await runCommand(running.deps, id, { type: "galaxy_warp", y: 3, x: 3 });
  await waitForBoard(page, warped!.map as string[]);
  await page.screenshot({ path: `${OUT}desktop-quadrant.png` });
  await page.close();
});

test("U-10: the tabs swap the Quadrant and Galaxy maps, opening on Quadrant and staying through new frames", async () => {
  const id = await gameId();
  const page = await openGame(id, { width: 1100, height: 800 });
  const selected = page.locator("[role=tab][aria-selected=true]");
  assert.equal(await selected.textContent(), "Quadrant");
  assert.equal(await page.locator("#board").isVisible(), true);
  assert.equal(await page.locator("#galaxy").isVisible(), false);

  await page.click("#tab-galaxy");
  assert.equal(await selected.textContent(), "Galaxy");
  assert.equal(await page.locator("#board").isVisible(), false);
  assert.equal(await page.locator("#galaxy").isVisible(), true);

  await runCommand(running.deps, id, { type: "long_range_scan" });
  await page.waitForFunction(() => document.querySelector("#charted")!.textContent === "9 / 100");
  assert.equal(await selected.textContent(), "Galaxy");

  await page.click("#tab-quadrant");
  assert.equal(await page.locator("#board").isVisible(), true);
  assert.equal(await page.locator("#galaxy").isVisible(), false);
  await page.close();
});

async function scanAndWait(page: Page, id: string, charted: string): Promise<void> {
  await runCommand(running.deps, id, { type: "long_range_scan" });
  await page.waitForFunction((expected) => document.querySelector("#charted")!.textContent === expected, charted);
}

test("U-10: changing tabs replays no sector flash, whether it happened on or off screen", async () => {
  const id = await gameId();
  const page = await openGame(id, { width: 1100, height: 800 });
  const flashes = () => page.evaluate(() => document.getAnimations().filter((animation) => animation instanceof CSSAnimation && (animation.effect as KeyframeEffect).target?.closest("#galaxy")).length);

  await scanAndWait(page, id, "9 / 100");
  await page.click("#tab-galaxy");
  assert.equal(await flashes(), 0, "a flash from while Galaxy was hidden played on opening it");

  await runCommand(running.deps, id, { type: "galaxy_warp", y: 3, x: 3 });
  await scanAndWait(page, id, "14 / 100");
  assert.ok((await flashes()) > 0, "a flash should play while Galaxy is showing");
  await page.click("#tab-quadrant");
  await page.click("#tab-galaxy");
  assert.equal(await flashes(), 0, "a flash replayed on returning to Galaxy");
  await page.close();
});

test("the page announces how the game ended", async () => {
  const { deps } = running;
  for (const [status, text] of [["won", /galaxy is secure/], ["lost", /ship is lost/]] as const) {
    const id = await gameId();
    const page = await openGame(id, { width: 1100, height: 800 });
    assert.equal(await page.locator("#outcome").isVisible(), false);
    const ended = JSON.stringify({ ...JSON.parse((await deps.store.get(id))!), status });
    await deps.store.put(id, ended);
    await runCommand(deps, id, { type: "state" });
    await page.waitForSelector(`#outcome.${status}`);
    assert.match((await page.locator("#outcome").textContent())!, text);
    await page.close();
  }
});

test("either whole map fits a laptop screen", async () => {
  const page = await openGame(await gameId(), { width: 1100, height: 800 });
  const bottomOf = (selector: string) => page.locator(selector).evaluate((map) => map.getBoundingClientRect().bottom);
  const quadrant = await bottomOf("#board");
  assert.ok(quadrant > 0 && quadrant <= 800, `the quadrant map ends at ${quadrant}`);
  await page.click("#tab-galaxy");
  const galaxy = await bottomOf("#galaxy");
  assert.ok(galaxy > 0 && galaxy <= 800, `the galaxy map ends at ${galaxy}`);
  await page.close();
});

test("the page fits a phone with no sideways scroll", async () => {
  const page = await openGame(await gameId(), { width: 375, height: 700 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow, 0);
  await page.screenshot({ path: `${OUT}phone.png`, fullPage: true });
  await page.close();
});

test("the page says so when it has no game or an unknown game", async () => {
  const page = await browser.newPage();
  await page.goto(`${running.base}/`);
  assert.match((await page.locator("#notice").textContent())!, /No ship on this channel/);
  await page.goto(`${running.base}/?game=00000000-0000-4000-8000-000000000000`);
  await page.waitForSelector("body[data-link=absent]");
  assert.match((await page.locator("#notice").textContent())!, /isn't on record/);
  await page.close();
});

test("a page whose server goes away shows the lost signal and keeps the last view", async () => {
  const local = await startServer();
  const id = (await newGame(local.deps)).report!.game_id as string;
  const page = await browser.newPage();
  await page.goto(`${local.base}/?game=${id}`);
  await page.waitForSelector("body[data-link=live]");
  await stopServer(local);
  await page.waitForSelector("body[data-link=lost]");
  assert.equal(await page.locator(".sector:not(.hidden)").count(), 1);
  await page.close();
});

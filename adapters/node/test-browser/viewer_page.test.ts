// U-1, U-2, U-8, U-9, U-10, U-11: the real page in a real browser, against the real server, while commands run.
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
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}desktop-after-warp.png` });
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
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}desktop-quadrant.png` });
  await page.close();
});

test("U-10: one display: both maps, the gauges and the survey show together, with nothing to click", async () => {
  const page = await openGame(await gameId(), { width: 1100, height: 800 });
  for (const selector of ["#board", "#galaxy", "#gauges", ".survey"]) {
    assert.equal(await page.locator(selector).isVisible(), true, selector);
  }
  assert.equal(await page.locator("#console button, #console [role=tab], #console a").count(), 0);
  await page.close();
});

/** How many animations are running on the tank or inside it. */
function tankAnimations(page: Page): Promise<number> {
  return page.evaluate(() => document.getAnimations().filter((animation) => animation instanceof CSSAnimation && (animation.effect as KeyframeEffect).target?.closest("#tank")).length);
}

test("U-11: a warp plays on the hologram, and the first frame doesn't", async () => {
  const id = await gameId();
  const page = await openGame(id, { width: 1100, height: 800 });
  assert.equal(await tankAnimations(page), 0);
  await runCommand(running.deps, id, { type: "galaxy_warp", y: 3, x: 3 });
  await page.waitForSelector("#tank.warping");
  assert.ok((await tankAnimations(page)) > 0);
  await page.close();
});

test("U-11: an enemy gone from the ship's sector flares the hologram", async () => {
  const { deps } = running;
  const id = await gameId();
  const page = await openGame(id, { width: 1100, height: 800 });
  const setEnemies = async (enemies: number) => {
    const game = JSON.parse((await deps.store.get(id))!);
    const [y, x] = game.sector_yx;
    game.galaxy.sectors[y][x].enemies = enemies;
    await deps.store.put(id, JSON.stringify(game));
    await runCommand(deps, id, { type: "state" });
  };
  await setEnemies(2);
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#tank.struck").count(), 0, "more enemies isn't a kill");
  await setEnemies(1);
  await page.waitForSelector("#tank.struck");
  assert.ok((await tankAnimations(page)) > 0);
  await page.close();
});

test("the marks stand up from the tilted plane", async () => {
  const page = await openGame(await gameId(), { width: 1100, height: 800 });
  const box = (selector: string) => page.locator(selector).first().evaluate((node) => {
    const { width, height } = node.getBoundingClientRect();
    return { width, height };
  });
  const cell = await box("#board .cell");
  const ship = await box("#board .ship");
  assert.ok(cell.height < cell.width * 0.9, "the plane is tilted");
  assert.ok(ship.height > ship.width * 0.9, "the ship faces the viewer");
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
    await page.screenshot({ path: `${OUT}outcome-${status}.png` });
    await page.close();
  }
});

test("the whole display fits a laptop screen, with no scrolling", async () => {
  const page = await openGame(await gameId(), { width: 1100, height: 800 });
  const bottomOf = (selector: string) => page.locator(selector).evaluate((node) => node.getBoundingClientRect().bottom);
  for (const selector of ["#board", "#galaxy", ".tank-section .legend", ".galaxy-panel"]) {
    const bottom = await bottomOf(selector);
    assert.ok(bottom > 0 && bottom <= 800, `${selector} ends at ${bottom}`);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), "the page scrolls");
  const plane = await page.locator("#board").evaluate((node) => node.getBoundingClientRect().toJSON());
  const section = await page.locator(".tank-section").evaluate((node) => node.getBoundingClientRect().toJSON());
  const legend = await page.locator(".tank-section .legend").evaluate((node) => node.getBoundingClientRect().top);
  assert.ok(plane.left >= section.left && plane.right <= section.right, "the plane stays clear of the side panels");
  assert.ok(plane.bottom <= legend, "the plane stays clear of its legend");
  await page.screenshot({ path: `${OUT}desktop.png` });
  await page.close();
});

test("the display uses a wider screen", async () => {
  const page = await openGame(await gameId(), { width: 1600, height: 900 });
  await page.screenshot({ path: `${OUT}desktop-wide.png` });
  const width = await page.locator("#board").evaluate((node) => node.getBoundingClientRect().width);
  assert.ok(width > 600, `the plane is only ${width} wide`);
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

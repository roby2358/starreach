// U-1, U-2, U-8, U-9, U-10, U-11, U-13, U-16: the real page in a real browser, against the real server, while commands run.
// A screenshot of the page goes to test-browser/out/ to look at.

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { LOCAL_PLAYER, newGame, runCommand, viewId, type GoalState, type McpDeps } from "@starreach/app";
import { chromium, type Browser, type Page } from "playwright-core";

import { startServer, stopServer, type Running, TEST_CLIENT } from "../test/helpers/server.ts";

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
  await page.goto(`${running.base}/viewer?view=${await viewId(gameId)}`);
  await page.waitForSelector("body[data-link=live]");
  return page;
}

async function gameId(): Promise<string> {
  return (await newGame(running.deps, TEST_CLIENT)).report!.game_id as string;
}

/** Rewrites a stored game's fields and shows the result to its viewers, as a command would. */
async function rewriteGame(deps: McpDeps, id: string, rewrite: (game: any) => void): Promise<void> {
  const stored = (await deps.store.get(await viewId(id)))!;
  const game = JSON.parse(stored.game);
  rewrite(game);
  await deps.store.put(await viewId(id), { ...stored, game: JSON.stringify(game) });
  await runCommand(deps, id, { type: "state" });
}

/** Where the page's three subjects sit. */
function placement(page: Page): Promise<unknown> {
  return page.evaluate(() => ["#board", "#galaxy", "#gauges"].map((selector) => document.querySelector(selector)!.getBoundingClientRect().toJSON()));
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
  // The scan's top row is row 3, and its last entry is column 5: sector (5, 3), the 6th cell of the map's 4th row.
  const topRight = (scan.report as { scan: string[] }).scan[0].split(" ")[2];
  const label = await page.locator(".sector").nth(3 * 10 + 5).getAttribute("aria-label");
  const [enemies, bases, stars] = topRight.split("|");
  assert.equal(label, `Sector 5,3: ${enemies} enemies, ${bases} starbases, ${stars} stars`);

  await runCommand(running.deps, id, { type: "galaxy_warp", x: 5, y: 3 });
  await page.waitForFunction(() => document.querySelector("#sector")!.textContent === "(5, 3)");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}desktop-after-warp.png` });
  await page.close();
});

test("U-2: the ship's status follows the game, and nothing goes back up the socket", async () => {
  const id = await gameId();
  const sent: unknown[] = [];
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on("websocket", (socket) => socket.on("framesent", (frame) => sent.push(frame)));
  await page.goto(`${running.base}/viewer?view=${await viewId(id)}`);
  await page.waitForSelector("body[data-link=live]");
  const energy = page.locator("[data-gauge=energy] .gauge-value");
  assert.match((await energy.textContent())!, /^(\d+) \/ \1$/);
  assert.equal(await page.locator("#stardate").textContent(), "102.0773.00.0");

  const { state } = await runCommand(running.deps, id, { type: "long_range_scan" });
  await page.waitForFunction(
    (expected) => document.querySelector("[data-gauge=energy] .gauge-value")!.textContent === expected,
    `${state!.ship_energy} / ${state!.ship_max_energy}`,
  );
  assert.equal(await page.locator("[data-gauge=hull] .gauge-value").textContent(), `${state!.ship_hull} / ${state!.ship_max_hull}`);
  assert.equal(await page.locator("#stardate").textContent(), state!.stardate);
  assert.notEqual(state!.stardate, "102.0773.00.0");
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

  const [x, y] = start!.ship_xy as [number, number];
  const y2 = y === 0 ? 1 : y - 1;
  const x2 = [x - 1, x, x + 1].find((c) => (start!.map as string[])[y2]?.[c] === ".")!;
  const { state: moved } = await runCommand(running.deps, id, { type: "subwarp", x: x2, y: y2 });
  assert.deepEqual(moved!.ship_xy, [x2, y2]);
  await waitForBoard(page, moved!.map as string[]);

  const { state: warped } = await runCommand(running.deps, id, { type: "galaxy_warp", x: 3, y: 3 });
  await waitForBoard(page, warped!.map as string[]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}desktop-quadrant.png` });
  await page.close();
});

test("U-10: one display: both maps, the gauges, the survey and the goals show together, and the one control opens the achievements", async () => {
  const page = await openGame(await gameId(), { width: 1100, height: 800 });
  for (const selector of ["#board", "#galaxy", "#gauges", ".survey", "#goals"]) {
    assert.equal(await page.locator(selector).isVisible(), true, selector);
  }
  assert.equal(await page.locator("#console [role=tab], #console a").count(), 0);
  assert.deepEqual(await page.locator("#console button").evaluateAll((buttons) => buttons.map((button) => button.id)), ["record-toggle"]);
  await page.close();
});

test("U-16: the game's three goals show with their progress, and a goal is marked when it is met", async () => {
  const { deps } = running;
  const id = await gameId();
  const page = await openGame(id, { width: 1100, height: 800 });
  const goals = (await runCommand(deps, id, { type: "state" })).state!.goals as GoalState[];
  const row = (goal: GoalState) => page.locator(`#goals .goal[data-goal=${goal.counter}]`);

  assert.equal(await page.locator("#goals .goal").count(), 3);
  for (const goal of goals) {
    assert.equal(await row(goal).locator(".gauge-label > span").first().textContent(), goal.label);
    assert.equal(await row(goal).locator(".gauge-value").textContent(), `0 / ${goal.amount}`);
    assert.equal(await row(goal).locator(".gauge-fill").evaluate((fill) => (fill as HTMLElement).style.width), "0%");
  }
  assert.equal(await page.locator("#goals .goal.met, #goals .goal.reached").count(), 0);

  const [met, begun, untouched] = goals;
  await rewriteGame(deps, id, (game) => {
    game.counters[met.counter] = met.amount;
    game.goals[0].met = true;
    game.counters[begun.counter] = 1;
  });
  await page.waitForSelector(`#goals .goal.met[data-goal=${met.counter}]`);
  assert.equal(await row(met).locator(".goal-met").textContent(), "Met");
  assert.equal(await row(met).locator(".gauge-value").textContent(), `Met${met.amount} / ${met.amount}`);
  assert.equal(await row(met).locator(".gauge-fill").evaluate((fill) => (fill as HTMLElement).style.width), "100%");
  assert.equal(await row(begun).locator(".gauge-value").textContent(), `1 / ${begun.amount}`);
  assert.equal(await row(begun).locator(".gauge-fill").evaluate((fill) => (fill as HTMLElement).style.width), `${Math.min(1 / begun.amount, 1) * 100}%`);
  assert.equal(await row(untouched).locator(".gauge-value").textContent(), `0 / ${untouched.amount}`);
  assert.deepEqual(await page.locator("#goals .goal.met").evaluateAll((rows) => rows.map((node) => (node as HTMLElement).dataset.goal)), [met.counter]);
  assert.deepEqual(await page.locator("#goals .goal.reached").evaluateAll((rows) => rows.map((node) => (node as HTMLElement).dataset.goal)), [met.counter], "the goal just met flashes");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}desktop-goals.png` });

  const later = await openGame(id, { width: 1100, height: 800 });
  assert.equal(await later.locator("#goals .goal.met").count(), 1);
  assert.equal(await later.locator("#goals .goal.reached").count(), 0, "a goal already met doesn't flash on the first frame");
  await later.close();
  await page.close();
});

test("U-13: the Achievements button opens a scrolling panel of the player's lifetime totals, the counter nearest its next rung first", async () => {
  const local = await startServer();
  const { deps } = local;
  await deps.players.add(LOCAL_PLAYER, { enemies_destroyed: 137, docks: 4, shield_damage: 999, scans: 2 });
  const id = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;
  const sent: unknown[] = [];
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on("websocket", (socket) => socket.on("framesent", (frame) => sent.push(frame)));
  await page.goto(`${local.base}/viewer?view=${await viewId(id)}`);
  await page.waitForSelector("body[data-link=live]");
  const row = (key: string) => page.locator(`#achievements .achievement[data-counter=${key}]`);
  const rowTexts = (key: string) => row(key).locator("span").allTextContents();

  assert.equal(await page.locator("#record").isVisible(), false);
  assert.equal(await page.locator("#record-toggle").getAttribute("aria-expanded"), "false");
  const closed = await placement(page);

  await page.locator("#record-toggle").click();
  assert.equal(await page.locator("#record").isVisible(), true);
  assert.equal(await page.locator("#record-toggle").getAttribute("aria-expanded"), "true");
  assert.deepEqual(await placement(page), closed, "opening the panel moves nothing");

  const table = deps.core.counterTable().map((counter) => counter.key);
  const nearest = ["shield_damage", "docks", "enemies_destroyed"];
  const shown = await page.locator("#achievements .achievement").evaluateAll((rows) => rows.map((node) => (node as HTMLElement).dataset.counter));
  assert.deepEqual(shown, [...nearest, ...table.filter((key) => !nearest.includes(key))]);
  assert.deepEqual(await rowTexts("enemies_destroyed"), ["enemies destroyed", "137", "Reached 100", "Next 200"]);
  assert.deepEqual(await rowTexts("shield_damage"), ["shield damage taken", "999", "No mark yet", "Next 1000"]);
  assert.deepEqual(await rowTexts("scans"), ["long range scans", "2", "Reached 2", "Next 5"]);
  assert.equal(await row("enemies_destroyed").locator(".gauge-fill").evaluate((fill) => (fill as HTMLElement).style.width), "37%");
  assert.equal(await page.locator("#achievements .achievement.reached").count(), 0);

  const list = await page.locator("#achievements").evaluate((node) => ({ content: node.scrollHeight, shown: node.clientHeight }));
  assert.ok(list.content > list.shown, "the list scrolls inside the panel");
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), "the page scrolls");
  const panel = await page.locator("#record").evaluate((node) => node.getBoundingClientRect().toJSON());
  const board = await page.locator("#board").evaluate((node) => node.getBoundingClientRect().toJSON());
  const galaxy = await page.locator(".galaxy-panel").evaluate((node) => node.getBoundingClientRect().toJSON());
  assert.ok(panel.left >= board.right && panel.top >= galaxy.bottom && panel.bottom <= 800, "the panel covers the board or the galaxy map");
  await page.screenshot({ path: `${OUT}desktop-achievements.png` });

  await deps.players.add(LOCAL_PLAYER, { docks: 1 });
  await runCommand(deps, id, { type: "state" });
  await page.waitForSelector("#achievements .achievement.reached[data-counter=docks]");
  assert.deepEqual(await rowTexts("docks"), ["docks at a starbase", "5", "Reached 5", "Next 10"]);
  assert.equal(await page.locator("#achievements .achievement.reached").count(), 1, "only the counter that reached a rung flashes");

  await page.locator("#record-close").click();
  assert.equal(await page.locator("#record").isVisible(), false);
  await page.locator("#record-toggle").click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#record").isVisible(), false);
  assert.equal(await page.locator("#record-toggle").getAttribute("aria-expanded"), "false");
  assert.deepEqual(sent, [], "the panel sends nothing up the socket");
  await page.close();
  await stopServer(local);
});

test("U-13: on a phone the achievements open over the lower screen, with no sideways scroll", async () => {
  const id = await gameId();
  const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
  await page.goto(`${running.base}/viewer?view=${await viewId(id)}#achievements`);
  await page.waitForSelector("body[data-link=live]");
  assert.equal(await page.locator("#record").isVisible(), true, "a link ending #achievements opens with the panel showing");
  const panel = await page.locator("#record").evaluate((node) => node.getBoundingClientRect().toJSON());
  assert.ok(panel.left >= 0 && panel.right <= 375 && panel.top > 0 && panel.bottom <= 700, `the panel is at ${JSON.stringify(panel)}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  await page.screenshot({ path: `${OUT}phone-achievements.png` });
  await page.locator("#record-close").click();
  assert.equal(await page.locator("#goals .goal").count(), 3);
  assert.equal(await page.locator("#goals").isVisible(), true);
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
  await runCommand(running.deps, id, { type: "galaxy_warp", x: 3, y: 3 });
  await page.waitForSelector("#tank.warping");
  assert.ok((await tankAnimations(page)) > 0);
  await page.close();
});

test("U-11: an enemy gone from the ship's sector flares the hologram", async () => {
  const { deps } = running;
  const id = await gameId();
  const page = await openGame(id, { width: 1100, height: 800 });
  const setEnemies = async (enemies: number) => {
    const stored = (await deps.store.get(await viewId(id)))!;
    const game = JSON.parse(stored.game);
    const [x, y] = game.sector_xy;
    game.galaxy.sectors[y][x].enemies = enemies;
    await deps.store.put(await viewId(id), { ...stored, game: JSON.stringify(game) });
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
    const stored = (await deps.store.get(await viewId(id)))!;
    await deps.store.put(await viewId(id), { ...stored, game: JSON.stringify({ ...JSON.parse(stored.game), status }) });
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
  await page.goto(`${running.base}/viewer`);
  assert.match((await page.locator("#notice").textContent())!, /No ship on this channel/);
  assert.equal(await page.locator("#home-link").getAttribute("href"), "/");
  assert.ok(await page.locator("#home-link").isVisible(), "a viewer with no game links to the home page");
  await page.goto(`${running.base}/viewer?view=${"0".repeat(64)}`);
  await page.waitForSelector("body[data-link=absent]");
  assert.match((await page.locator("#notice").textContent())!, /isn't on record/);
  await page.close();
});

test("a page whose server goes away shows the lost signal and keeps the last view", async () => {
  const local = await startServer();
  const id = (await newGame(local.deps, TEST_CLIENT)).report!.game_id as string;
  const page = await browser.newPage();
  await page.goto(`${local.base}/viewer?view=${await viewId(id)}`);
  await page.waitForSelector("body[data-link=live]");
  await stopServer(local);
  await page.waitForSelector("body[data-link=lost]");
  assert.equal(await page.locator(".sector:not(.hidden)").count(), 1);
  await page.close();
});

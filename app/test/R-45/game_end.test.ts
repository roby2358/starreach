// R-45 (app layer): the command that ends a game completes its game record, once, with the
// outcome, what ended it, the game's counters and its goals.

import assert from "node:assert/strict";
import { test } from "node:test";

import { runCommand, type GoalState, type MemoryTelemetry } from "../../src/index.ts";
import { testDeps } from "../helpers/deps.ts";
import { onlyGame, play, playOut, playToTheEnd, rewriteStored, SCRIPT, SCRIPT_SEED, startSeeded, STEP } from "../helpers/telemetry.ts";

/** The stored game with no enemy left in any sector but the ship's. */
function withEnemiesOnlyHere(game: any): unknown {
  const [shipX, shipY] = game.sector_xy;
  const sectors = game.galaxy.sectors.map((row: any[], y: number) => row.map((sector, x) => (x === shipX && y === shipY ? sector : { ...sector, enemies: 0 })));
  return { ...game, galaxy: { ...game.galaxy, sectors } };
}

/** The stored game with the ship one hit from destruction: no shields, and energy for one scan
 *  and none to recharge them, so the enemies' turn after the scan decides it. */
function withOneScanOfEnergyAndNoDefence(game: any): unknown {
  return { ...game, ship: { ...game.ship, hull: 1, shields: 0, energy: 500 } };
}

/** The outcome and cause the one game record ended with. */
function endOf(telemetry: MemoryTelemetry): [string, string] {
  const end = onlyGame(telemetry).end!;
  return [end.outcome, end.ended_by];
}

test("a lost game's record ends with the outcome lost", async () => {
  const deps = testDeps();

  await playToTheEnd(deps);

  assert.equal(onlyGame(deps.telemetry).end!.outcome, "lost");
});

test("a ship that runs out of energy away from a starbase ends its game stranded", async () => {
  const deps = testDeps();
  const gameId = await startSeeded(deps, SCRIPT_SEED);

  const last = await playOut(deps, gameId);

  assert.equal(last.events.includes("The ship is stranded without energy to reach a starbase"), true);
  assert.deepEqual(endOf(deps.telemetry), ["lost", "stranded"]);
});

test("a ship destroyed by enemy fire ends its game by the ship's destruction", async () => {
  const deps = testDeps();
  const gameId = await startSeeded(deps, SCRIPT_SEED);
  await play(deps, gameId, SCRIPT.slice(0, STEP.warp + 1));
  await rewriteStored(deps, gameId, withOneScanOfEnergyAndNoDefence);

  const [fired] = await play(deps, gameId, [{ type: "long_range_scan" }]);

  assert.equal(fired.events.includes("The ship is destroyed"), true);
  assert.deepEqual(endOf(deps.telemetry), ["lost", "ship_destroyed"]);
});

test("destroying the galaxy's last enemy ends the game won, by the galaxy cleared", async () => {
  const deps = testDeps();
  const gameId = await startSeeded(deps, SCRIPT_SEED);
  await play(deps, gameId, SCRIPT.slice(0, STEP.blastKill));
  await rewriteStored(deps, gameId, withEnemiesOnlyHere);

  const [kill] = await play(deps, gameId, [SCRIPT[STEP.blastKill]]);

  assert.equal(kill.events.includes("Every enemy in the galaxy is destroyed"), true);
  assert.deepEqual(endOf(deps.telemetry), ["won", "galaxy_cleared"]);
});

test("the ended record carries the game's counters as its last Result shows them", async () => {
  const deps = testDeps();

  const { last } = await playToTheEnd(deps);

  assert.deepEqual(onlyGame(deps.telemetry).end!.counters, last.state!.counters);
});

test("the ended record lists each goal's counter and amount and whether it was met", async () => {
  const deps = testDeps();

  const { last } = await playToTheEnd(deps);

  const goals = (last.state!.goals as GoalState[]).map(({ counter, amount, met }) => ({ counter, amount, met }));
  assert.equal(goals.length, 3);
  assert.deepEqual(onlyGame(deps.telemetry).end!.goals, goals);
});

test("calls after the end leave the completed record as it was", async () => {
  const deps = testDeps();
  const { gameId } = await playToTheEnd(deps);
  const ended = onlyGame(deps.telemetry);

  await runCommand(deps, gameId, { type: "state" });
  await runCommand(deps, gameId, { type: "long_range_scan" });

  assert.deepEqual(onlyGame(deps.telemetry), ended);
});

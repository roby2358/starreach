// R-46 (app layer): what each tool's event tells beyond the common fields, from the tool's own
// Result.

import assert from "node:assert/strict";
import { test } from "node:test";

import { testDeps } from "../helpers/deps.ts";
import { play, playScript, SCRIPT_SEED, STEP, storeSeededGame } from "../helpers/telemetry.ts";

test("a subwarp's event tells the cells moved and the energy cost", async () => {
  const deps = testDeps();

  const { results } = await playScript(deps);

  assert.equal(results[STEP.subwarp].report!.energy_cost, 6);
  assert.deepEqual(deps.telemetry.events()[STEP.subwarp].detail, { distance: 3, energy_cost: 6 });
});

test("a warp's event tells the distance in sectors, the energy cost and the shield recharge", async () => {
  const deps = testDeps();

  const { results } = await playScript(deps);

  assert.deepEqual(deps.telemetry.events()[STEP.warp].detail, {
    distance: 1.41,
    energy_cost: results[STEP.warp].report!.energy_cost as number,
    shield_recharge: 0,
  });
});

test("a warp that recharges the shields tells the points recharged", async () => {
  const deps = testDeps();
  await storeSeededGame(deps, "recharged", SCRIPT_SEED);

  const [arrival, back] = await play(deps, "recharged", [
    { type: "galaxy_warp", x: 5, y: 3 },
    { type: "galaxy_warp", x: 4, y: 4 },
  ]);

  const said = back.events.map((event) => /^Shields recharged by (\d+) using/.exec(event)).find((match) => match !== null);
  assert.ok((arrival.state!.ship_shields as number) < (arrival.state!.ship_max_shields as number));
  assert.equal(deps.telemetry.events()[1].detail.shield_recharge, Number(said![1]));
});

test("a blast's event tells the range to the enemy on the line, that it missed, and the energy cost", async () => {
  const deps = testDeps();

  const { results } = await playScript(deps);

  assert.equal(results[STEP.blastMiss].report!.destroyed, false);
  assert.deepEqual(deps.telemetry.events()[STEP.blastMiss].detail, {
    range: 7.21,
    hit: false,
    energy_cost: results[STEP.blastMiss].report!.energy_cost as number,
  });
});

test("a blast that kills is told as a hit, at the range the state gave for that enemy", async () => {
  const deps = testDeps();

  const { results } = await playScript(deps);

  const [enemy] = results[STEP.blastKill - 1].state!.enemies as { range: number }[];
  const { range, hit } = deps.telemetry.events()[STEP.blastKill].detail;
  assert.deepEqual([range, hit], [enemy.range, true]);
});

test("a torpedo's event tells the range and the hit", async () => {
  const deps = testDeps();

  await playScript(deps);

  assert.deepEqual(deps.telemetry.events()[STEP.torpedo].detail, { range: 6, hit: true });
});

test("a dock's event is the docking: accepted, with nothing more to tell", async () => {
  const deps = testDeps();

  await playScript(deps);

  const dock = deps.telemetry.events()[STEP.dock];
  assert.deepEqual([dock.tool, dock.accepted, dock.detail], ["dock", true, {}]);
});

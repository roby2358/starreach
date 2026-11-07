// R-21 (app layer): an accepted command publishes the game's view to its viewers; a refused
// one, or one on an unknown game, publishes nothing.

import assert from "node:assert/strict";
import { test } from "node:test";

import { newGame, runCommand } from "../../src/index.ts";
import { testDeps } from "../helpers/deps.ts";

test("an accepted command publishes a view frame for that game", async () => {
  const deps = testDeps();
  const gameId = (await newGame(deps)).report!.game_id as string;

  const scan = await runCommand(deps, gameId, { type: "long_range_scan" });

  assert.equal(deps.viewers.published.length, 1);
  const [publishedId, frame] = deps.viewers.published[0];
  assert.equal(publishedId, gameId);
  const parsed = JSON.parse(frame);
  assert.equal(parsed.type, "view");
  assert.equal(parsed.view.ship.energy, scan.state!.ship_energy);
});

test("a refused command publishes nothing", async () => {
  const deps = testDeps();
  const gameId = (await newGame(deps)).report!.game_id as string;

  const refused = await runCommand(deps, gameId, { type: "galaxy_warp", y: 99, x: 99 });

  assert.equal(refused.ok, false);
  assert.deepEqual(deps.viewers.published, []);
});

test("an unknown game publishes nothing", async () => {
  const deps = testDeps();
  await runCommand(deps, "no-such-game", { type: "state" });
  assert.deepEqual(deps.viewers.published, []);
});

test("new_game reports the viewer's link for the game", async () => {
  const deps = testDeps();
  const { report } = await newGame(deps);
  assert.equal(report!.view_url, `http://viewer.test/?game=${report!.game_id}`);
});

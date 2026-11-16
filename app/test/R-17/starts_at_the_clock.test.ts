// R-17 (app layer): a new game's stardate starts from the clock the adapter supplies, and the
// viewers are shown the same stardate as the player.

import assert from "node:assert/strict";
import { test } from "node:test";

import { newGame, runCommand } from "../../src/index.ts";
import { START_UNIX_SECONDS, testDeps, TEST_CLIENT } from "../helpers/deps.ts";

test("a new game starts at the stardate of the supplied clock", async () => {
  const created = await newGame(testDeps(), TEST_CLIENT);
  assert.equal(created.state!.stardate, "102.0773.00.0");
});

test("a game started half a day later starts half a stardate later", async () => {
  const created = await newGame({ ...testDeps(), unixSeconds: () => START_UNIX_SECONDS + 43_200 }, TEST_CLIENT);
  assert.equal(created.state!.stardate, "102.0773.50.0");
});

test("an action reports its time as a duration and moves the stardate for player and viewer", async () => {
  const deps = testDeps();
  const gameId = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;

  const scan = await runCommand(deps, gameId, { type: "long_range_scan" });

  assert.equal(scan.report!.time, "0.00.7");
  assert.equal(scan.state!.stardate, "102.0773.00.7");
  assert.equal(JSON.parse(deps.viewers.published[0][1]).view.stardate, "102.0773.00.7");
});

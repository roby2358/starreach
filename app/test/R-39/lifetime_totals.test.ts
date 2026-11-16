// R-39 (app layer): what an accepted command counts is added to the lifetime totals of the
// player who issued it, across that player's games and no one else's.

import assert from "node:assert/strict";
import { test } from "node:test";

import { LOCAL_PLAYER, newGame, runCommand, type McpDeps } from "../../src/index.ts";
import { testDeps } from "../helpers/deps.ts";

async function scanInNewGame(deps: McpDeps): Promise<void> {
  const gameId = (await newGame(deps)).report!.game_id as string;
  const scan = await runCommand(deps, gameId, { type: "long_range_scan" });
  assert.equal(scan.ok, true);
}

test("totals accumulate across two games of one player", async () => {
  const deps = { ...testDeps(), player: "alice" };

  await scanInNewGame(deps);
  await scanInNewGame(deps);

  assert.equal((await deps.players.totals("alice")).scans, 2);
});

test("a player's totals are not another player's", async () => {
  const shared = testDeps();
  const alice = { ...shared, player: "alice" };
  const bob = { ...shared, player: "bob" };

  await scanInNewGame(alice);
  await scanInNewGame(alice);
  await scanInNewGame(bob);

  assert.equal((await shared.players.totals("alice")).scans, 2);
  assert.equal((await shared.players.totals("bob")).scans, 1);
});

test("the totals go to the player who issued the command, whoever started the game", async () => {
  const shared = testDeps();
  const gameId = (await newGame({ ...shared, player: "alice" })).report!.game_id as string;

  await runCommand({ ...shared, player: "bob" }, gameId, { type: "long_range_scan" });

  assert.deepEqual(await shared.players.totals("alice"), {});
  assert.equal((await shared.players.totals("bob")).scans, 1);
});

test("with no sign-in the totals belong to the one local player", async () => {
  const deps = testDeps();

  await scanInNewGame(deps);
  await scanInNewGame(deps);

  assert.equal((await deps.players.totals(LOCAL_PLAYER)).scans, 2);
});

test("a refused command adds nothing", async () => {
  const deps = { ...testDeps(), player: "alice" };
  const gameId = (await newGame(deps)).report!.game_id as string;

  const refused = await runCommand(deps, gameId, { type: "galaxy_warp", x: 99, y: 99 });

  assert.equal(refused.ok, false);
  assert.deepEqual(await deps.players.totals("alice"), {});
});

test("a new game, a query and an unknown game add nothing", async () => {
  const deps = { ...testDeps(), player: "alice" };
  const gameId = (await newGame(deps)).report!.game_id as string;

  await runCommand(deps, gameId, { type: "state" });
  await runCommand(deps, gameId, { type: "galaxy_map" });
  await runCommand(deps, "no-such-game", { type: "long_range_scan" });

  assert.deepEqual(await deps.players.totals("alice"), {});
});

test("a command adds only what it counted, not the game's counts so far", async () => {
  const deps = { ...testDeps(), player: "alice" };
  const gameId = (await newGame(deps)).report!.game_id as string;

  const first = await runCommand(deps, gameId, { type: "long_range_scan" });
  const second = await runCommand(deps, gameId, { type: "long_range_scan" });

  assert.equal((second.state!.counters as Record<string, number>).scans, 2);
  assert.equal(first.ok && second.ok, true);
  assert.equal((await deps.players.totals("alice")).scans, 2);
});

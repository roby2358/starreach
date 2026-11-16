// R-47 (app layer): no telemetry record holds the game_id, the view_id or the player id, and the
// keys that stand in for them can't be used as them.

import assert from "node:assert/strict";
import { test } from "node:test";

import { PLAYER_HASH_SALT, playerHash, runCommand, telemetryGameKey, viewId } from "../../src/index.ts";
import { testDeps } from "../helpers/deps.ts";
import { onlyGame, playToTheEnd } from "../helpers/telemetry.ts";

const PLAYER = "did:plc:alice-example-player-id";

/** Every record a finished game left, as the text a reader of telemetry would get. */
async function recordsOfAFinishedGame(): Promise<{ text: string; gameId: string }> {
  const deps = { ...testDeps(), player: PLAYER };
  const { gameId } = await playToTheEnd(deps);
  await runCommand(deps, gameId, { type: "blast", x: 0, y: 0 });
  return { text: JSON.stringify([deps.telemetry.games(), deps.telemetry.events()]), gameId };
}

test("no record holds the game_id", async () => {
  const { text, gameId } = await recordsOfAFinishedGame();

  assert.equal(text.includes(gameId), false);
});

test("no record holds the view_id", async () => {
  const { text, gameId } = await recordsOfAFinishedGame();

  assert.equal(text.includes(await viewId(gameId)), false);
});

test("no record holds the player id", async () => {
  const { text } = await recordsOfAFinishedGame();

  assert.equal(text.includes(PLAYER), false);
});

test("the telemetry game key is a hash that is neither the game_id nor the view_id", async () => {
  const key = await telemetryGameKey("some-game-id");

  assert.match(key, /^[0-9a-f]{64}$/);
  assert.notEqual(key, await viewId("some-game-id"));
});

test("the telemetry game key names no game: as a game_id it is Game not found", async () => {
  const deps = testDeps();
  const { gameId } = await playToTheEnd(deps);

  const answer = await runCommand(deps, await telemetryGameKey(gameId), { type: "state" });

  assert.deepEqual([answer.ok, answer.error], [false, "Game not found"]);
});

test("the telemetry game key is no view_id: the store holds no game under it", async () => {
  const deps = testDeps();
  const { gameId } = await playToTheEnd(deps);

  assert.equal(await deps.store.get(await telemetryGameKey(gameId)), undefined);
});

test("a player's hash is the same in every game of that player", async () => {
  const deps = { ...testDeps(), player: PLAYER };

  await playToTheEnd(deps);
  await playToTheEnd(deps);

  const [first, second] = deps.telemetry.games();
  assert.equal(first.player_hash, second.player_hash);
});

test("two players have different hashes", async () => {
  assert.notEqual(await playerHash("alice"), await playerHash("bob"));
});

test("the player hash is salted: it is not the bare hash of the player id", async () => {
  const deps = { ...testDeps(), player: PLAYER };

  await playToTheEnd(deps);

  assert.ok(PLAYER_HASH_SALT.length > 0);
  assert.notEqual(onlyGame(deps.telemetry).player_hash, await viewId(PLAYER));
});

// R-45 (app layer): new_game writes one game record to the telemetry sink, with what the game
// started from and who started it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { newGame, playerHash, RULES_VERSION, runCommand, telemetryGameKey } from "../../src/index.ts";
import { START_UNIX_SECONDS, TEST_CLIENT, testDeps } from "../helpers/deps.ts";
import { onlyGame } from "../helpers/telemetry.ts";

test("new_game leaves one game record, not yet ended", async () => {
  const deps = testDeps();

  await newGame(deps, TEST_CLIENT);

  assert.equal(deps.telemetry.games().length, 1);
  assert.equal(onlyGame(deps.telemetry).end, null);
});

test("a game record has the telemetry fields and no others", async () => {
  const deps = testDeps();

  await newGame(deps, TEST_CLIENT);

  assert.deepEqual(Object.keys(onlyGame(deps.telemetry)).sort(), ["client", "end", "game_key", "player_hash", "rules_version", "seed", "started_unix_seconds"]);
});

test("the record's key is the telemetry game key of the game_id", async () => {
  const deps = testDeps();

  const gameId = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;

  assert.equal(onlyGame(deps.telemetry).game_key, await telemetryGameKey(gameId));
});

test("the record carries the start time the core was given, the seed and the rules version", async () => {
  const deps = testDeps();

  await newGame(deps, TEST_CLIENT);

  const record = onlyGame(deps.telemetry);
  assert.equal(record.started_unix_seconds, START_UNIX_SECONDS);
  assert.equal(record.rules_version, RULES_VERSION);
  assert.ok(Number.isInteger(record.seed) && record.seed >= 0 && record.seed < 2 ** 32);
});

test("the record carries the hash of the player who started the game", async () => {
  const deps = { ...testDeps(), player: "alice" };

  await newGame(deps, TEST_CLIENT);

  assert.equal(onlyGame(deps.telemetry).player_hash, await playerHash("alice"));
});

test("with no sign-in the record carries the local player's hash", async () => {
  const deps = testDeps();

  await newGame(deps, TEST_CLIENT);

  assert.equal(onlyGame(deps.telemetry).player_hash, await playerHash("local"));
});

test("the record carries the MCP client new_game was given", async () => {
  const deps = testDeps();

  await newGame(deps, { name: "some-client", version: "1.2.3", user_agent: "some-agent/4" });

  assert.deepEqual(onlyGame(deps.telemetry).client, { name: "some-client", version: "1.2.3", user_agent: "some-agent/4" });
});

test("two games leave two records under different keys", async () => {
  const deps = testDeps();

  await newGame(deps, TEST_CLIENT);
  await newGame(deps, TEST_CLIENT);

  const [first, second] = deps.telemetry.games();
  assert.equal(deps.telemetry.games().length, 2);
  assert.notEqual(first.game_key, second.game_key);
});

test("commands on a game that goes on leave its record not ended", async () => {
  const deps = testDeps();
  const gameId = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;

  await runCommand(deps, gameId, { type: "long_range_scan" });
  await runCommand(deps, gameId, { type: "state" });

  assert.equal(onlyGame(deps.telemetry).end, null);
});

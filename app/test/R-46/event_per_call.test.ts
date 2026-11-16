// R-46 (app layer): every tool call on a game leaves one event record, accepted or refused,
// queries included, numbered in order; a call on no game leaves none.

import assert from "node:assert/strict";
import { test } from "node:test";

import { newGame, runCommand, telemetryGameKey } from "../../src/index.ts";
import { call, connectClient, TEST_CLIENT, testDeps } from "../helpers/deps.ts";
import { playScript, SCRIPT } from "../helpers/telemetry.ts";

test("a game played through every tool leaves one event per call", async () => {
  const deps = testDeps();

  await playScript(deps);

  assert.equal(deps.telemetry.events().length, SCRIPT.length);
});

test("an event has the telemetry fields and no others", async () => {
  const deps = testDeps();

  await playScript(deps);

  const fields = ["accepted", "args", "damage_taken", "detail", "energy", "game_key", "hull", "refusal", "sectors_cleared", "sectors_revealed", "seq", "shields", "startick", "ticks", "tool", "torpedoes", "unix_seconds"];
  for (const event of deps.telemetry.events()) {
    assert.deepEqual(Object.keys(event).sort(), fields);
  }
});

test("a game's events are numbered from 0 in the order of the calls", async () => {
  const deps = testDeps();

  await playScript(deps);

  assert.deepEqual(deps.telemetry.events().map((event) => event.seq), SCRIPT.map((_, index) => index));
});

test("each event names its tool and the tool's arguments", async () => {
  const deps = testDeps();

  await playScript(deps);

  const commands = deps.telemetry.events().map((event) => ({ type: event.tool, ...event.args }));
  assert.deepEqual(commands, SCRIPT);
});

test("every event of a game carries the game's telemetry key", async () => {
  const deps = testDeps();

  const { gameId } = await playScript(deps);

  const key = await telemetryGameKey(gameId);
  assert.ok(deps.telemetry.events().every((event) => event.game_key === key));
});

test("each event carries the adapter's clock at the call", async () => {
  const clock = { now: 5_000 };
  const deps = { ...testDeps(), unixSeconds: () => clock.now++ };

  await playScript(deps);

  assert.deepEqual(deps.telemetry.events().map((event) => event.unix_seconds), SCRIPT.map((_, index) => 5_000 + index));
});

test("two games number their events apart", async () => {
  const deps = testDeps();
  const first = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;
  const second = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;

  await runCommand(deps, first, { type: "state" });
  await runCommand(deps, second, { type: "state" });
  await runCommand(deps, first, { type: "galaxy_map" });

  assert.deepEqual(deps.telemetry.eventsOf(await telemetryGameKey(first)).map((event) => event.seq), [0, 1]);
  assert.deepEqual(deps.telemetry.eventsOf(await telemetryGameKey(second)).map((event) => event.seq), [0]);
});

test("a call on an unknown game leaves no event", async () => {
  const deps = testDeps();

  await runCommand(deps, "no-such-game", { type: "long_range_scan" });

  assert.deepEqual(deps.telemetry.events(), []);
});

test("new_game and whoami leave no event", async () => {
  const deps = testDeps();
  const client = await connectClient(deps);

  await call(client, "new_game", {});
  await client.callTool({ name: "whoami", arguments: {} });

  assert.deepEqual(deps.telemetry.events(), []);
});

test("a tool called over MCP leaves its event, with the arguments and without the game_id", async () => {
  const deps = testDeps();
  const client = await connectClient(deps);
  const gameId = (await call(client, "new_game", {})).report!.game_id as string;

  await call(client, "subwarp", { game_id: gameId, x: 0, y: 0 });

  const [event] = deps.telemetry.events();
  assert.equal(deps.telemetry.events().length, 1);
  assert.deepEqual([event.tool, event.args], ["subwarp", { x: 0, y: 0 }]);
});

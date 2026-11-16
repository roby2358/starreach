// R-40 (app layer): when a lifetime total reaches a rung of its counter's ladder, Star Central's
// message for it joins the command's events, once per rung.

import assert from "node:assert/strict";
import { test } from "node:test";

import { awardLifetime } from "../../src/achievements.ts";
import { newGame, runCommand, type CommandResult, type McpDeps } from "../../src/index.ts";
import { call, connectClient, testDeps, TEST_CLIENT } from "../helpers/deps.ts";

const ZERO = { enemies_destroyed: 0, docks: 0, shield_damage: 0 };

/** The first wording of each lifetime kind, which the test deps' roll of 0 picks. */
function commended(label: string, amount: number): string {
  return `Star Central to captain: commendation. Your lifetime tally of ${label} has reached ${amount}.`;
}
function notorious(label: string, amount: number): string {
  return `Star Central to captain: this is not a commendation. Your lifetime tally of ${label} has reached ${amount}.`;
}

async function scan(deps: McpDeps, gameId: string): Promise<CommandResult> {
  return runCommand(deps, gameId, { type: "long_range_scan" });
}

/** The game's seed is random, so its own goals may be announced too (R-42): the tests pick out
 *  the lifetime messages by the wording the roll of 0 gives. */
function count(events: string[], message: string): number {
  return events.filter((event) => event === message).length;
}

test("the commendation appears in the events exactly once when a rung is crossed", async () => {
  const deps = { ...testDeps(), player: "alice" };
  const gameId = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;

  const first = await scan(deps, gameId);

  assert.equal(count(first.events, commended("long range scans", 1)), 1);
  assert.equal(first.events.filter((event) => event.includes("lifetime tally of long range scans")).length, 1);
});

test("a command that crosses no rung carries no commendation, and a rung is announced once in a lifetime", async () => {
  const deps = { ...testDeps(), player: "alice" };
  const gameId = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;
  const events: string[][] = [];
  for (let scans = 1; scans <= 5; scans++) {
    events.push((await scan(deps, gameId)).events);
  }
  const otherGame = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;
  events.push((await scan(deps, otherGame)).events);

  const announced = events.map((list) => list.filter((event) => event.includes("lifetime tally of long range scans")));

  assert.deepEqual(announced, [
    [commended("long range scans", 1)],
    [commended("long range scans", 2)],
    [],
    [],
    [commended("long range scans", 5)],
    [],
  ]);
});

test("the commendation follows the lifetime total, not the game's count", async () => {
  const deps = { ...testDeps(), player: "alice" };
  await deps.players.add("alice", { scans: 9 });
  const gameId = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;

  const tenth = await scan(deps, gameId);

  assert.equal(count(tenth.events, commended("long range scans", 10)), 1);
});

test("the commendations come after the game's own events", async () => {
  const deps = { ...testDeps(), player: "alice" };
  const gameId = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;

  const { events } = await scan(deps, gameId);

  const firstCommendation = events.findIndex((event) => event.startsWith("Star Central"));
  assert.ok(firstCommendation >= 0);
  assert.ok(events.slice(firstCommendation).every((event) => event.startsWith("Star Central")));
});

test("one command can cross several rungs on several counters, each with its own message", async () => {
  const deps = { ...testDeps(), player: "alice" };

  const messages = await awardLifetime(deps, ZERO, { enemies_destroyed: 120, docks: 2, shield_damage: 2500 });

  assert.deepEqual(messages, [
    commended("enemies destroyed", 10),
    commended("enemies destroyed", 20),
    commended("enemies destroyed", 50),
    commended("enemies destroyed", 100),
    commended("docks at a starbase", 1),
    commended("docks at a starbase", 2),
    notorious("shield damage taken", 1000),
    notorious("shield damage taken", 2000),
  ]);
});

test("counts that cross no rung give no message", async () => {
  const deps = { ...testDeps(), player: "alice" };
  await deps.players.add("alice", { enemies_destroyed: 21, shield_damage: 100 });

  const messages = await awardLifetime(deps, ZERO, { enemies_destroyed: 28, docks: 0, shield_damage: 800 });

  assert.deepEqual(messages, []);
  assert.deepEqual(await deps.players.totals("alice"), { enemies_destroyed: 49, shield_damage: 900 });
});

test("each message's wording is picked by its own draw from the app's random numbers", async () => {
  const rolls = [0.0, 0.99];
  const deps = { ...testDeps(), player: "alice", random: () => rolls.shift()! };

  const messages = await awardLifetime(deps, ZERO, { enemies_destroyed: 20, docks: 0, shield_damage: 0 });

  assert.equal(messages[0], commended("enemies destroyed", 10));
  assert.equal(messages[1], deps.core.commendation("enemies_destroyed", 20, 0.99));
  assert.notEqual(messages[1], commended("enemies destroyed", 20));
  assert.deepEqual(rolls, []);
});

test("the commendation reaches the MCP caller in the tool's events", async () => {
  const deps = { ...testDeps(), player: "alice" };
  const client = await connectClient(deps);
  const gameId = (await call(client, "new_game", {})).report!.game_id as string;

  const result = await call(client, "long_range_scan", { game_id: gameId });

  assert.equal(count(result.events, commended("long range scans", 1)), 1);
});

// R-42 (app layer): a met goal is announced by the core in the command's events, after the
// game's own events and before any lifetime commendation the app layer adds, and the two are
// announced separately even on the same counter.

import assert from "node:assert/strict";
import { test } from "node:test";

import { runCommand } from "../../src/index.ts";
import { call, connectClient, goalsOf, storeGameWithGoal, testDeps } from "../helpers/deps.ts";

/** The lifetime commendation the test deps' roll of 0 picks. */
const FIRST_SCAN_COMMENDED = "Star Central to captain: commendation. Your lifetime tally of long range scans has reached 1.";

/** Star Central's messages about long range scans, in the order the events carry them. */
function aboutScans(events: string[]): string[] {
  return events.filter((event) => event.startsWith("Star Central") && event.includes("long range scans"));
}

test("one command that meets a goal and crosses a lifetime rung announces both, the objective first", async () => {
  const deps = { ...testDeps(), player: "alice" };
  const gameId = await storeGameWithGoal(deps, "scans", 1);

  const scanned = await runCommand(deps, gameId, { type: "long_range_scan" });

  const [objective, commendation, ...rest] = aboutScans(scanned.events);
  assert.equal(commendation, FIRST_SCAN_COMMENDED);
  assert.ok(!objective.includes("lifetime"));
  assert.match(objective, /\b1\b/);
  assert.deepEqual(rest, []);
  assert.equal(goalsOf(scanned).find((goal) => goal.counter === "scans")!.met, true);
});

test("Star Central's messages come after the game's own events", async () => {
  const deps = { ...testDeps(), player: "alice" };
  const gameId = await storeGameWithGoal(deps, "scans", 1);

  const { events } = await runCommand(deps, gameId, { type: "long_range_scan" });

  const first = events.findIndex((event) => event.startsWith("Star Central"));
  assert.ok(events.slice(first).every((event) => event.startsWith("Star Central")));
});

test("a goal is measured on this game's count, whatever the player's lifetime total", async () => {
  const deps = { ...testDeps(), player: "alice" };
  await deps.players.add("alice", { scans: 2 });
  const gameId = await storeGameWithGoal(deps, "scans", 2);

  const first = await runCommand(deps, gameId, { type: "long_range_scan" });
  const second = await runCommand(deps, gameId, { type: "long_range_scan" });
  const third = await runCommand(deps, gameId, { type: "long_range_scan" });

  assert.deepEqual(aboutScans(first.events), []);
  assert.equal(aboutScans(second.events).length, 1);
  assert.ok(!aboutScans(second.events)[0].includes("lifetime"));
  assert.equal(aboutScans(third.events).length, 1);
  assert.ok(aboutScans(third.events)[0].includes("lifetime tally of long range scans has reached 5"));
});

test("the met objective reaches the MCP caller in the tool's events, and the state shows it met", async () => {
  const deps = { ...testDeps(), player: "alice" };
  const gameId = await storeGameWithGoal(deps, "scans", 1);
  const client = await connectClient(deps);

  const scanned = await call(client, "long_range_scan", { game_id: gameId });
  const after = await call(client, "state", { game_id: gameId });

  assert.equal(aboutScans(scanned.events).length, 2);
  const goal = goalsOf(after).find((goal) => goal.counter === "scans")!;
  assert.deepEqual([goal.count, goal.amount, goal.met], [1, 1, true]);
});

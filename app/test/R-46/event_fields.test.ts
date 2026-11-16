// R-46 (app layer): what each event says of its call: accepted or refused and why, the game
// clock and the time taken, the ship after it, the damage taken, and the sectors revealed and
// cleared.

import assert from "node:assert/strict";
import { test } from "node:test";

import { viewId, type CommandResult } from "../../src/index.ts";
import { testDeps } from "../helpers/deps.ts";
import { playScript, STEP } from "../helpers/telemetry.ts";

function counter(result: CommandResult, key: string): number {
  return (result.state!.counters as Record<string, number>)[key];
}

test("each event says whether its call was accepted, with the refusal's reason when it was not", async () => {
  const deps = testDeps();

  const { results } = await playScript(deps);

  assert.deepEqual(
    deps.telemetry.events().map((event) => [event.accepted, event.refusal]),
    results.map((result) => [result.ok, result.error]),
  );
});

test("each event carries energy, shields, hull and torpedoes as the call left them", async () => {
  const deps = testDeps();

  const { results } = await playScript(deps);

  assert.deepEqual(
    deps.telemetry.events().map((event) => [event.energy, event.shields, event.hull, event.torpedoes]),
    results.map(({ state }) => [state!.ship_energy, state!.ship_shields, state!.ship_hull, state!.ship_quantorpedoes]),
  );
});

test("the last event's startick is the stored game's clock", async () => {
  const deps = testDeps();

  const { gameId } = await playScript(deps);

  const stored = await deps.store.get(await viewId(gameId));
  assert.equal(deps.telemetry.events().at(-1)!.startick, JSON.parse(stored!.game).startick);
});

test("an event's ticks are the clock's rise since the event before", async () => {
  const deps = testDeps();

  await playScript(deps);

  const events = deps.telemetry.events();
  for (let index = 1; index < events.length; index++) {
    assert.equal(events[index].ticks, events[index].startick - events[index - 1].startick);
  }
});

test("an accepted action takes at least one startick", async () => {
  const deps = testDeps();

  await playScript(deps);

  const events = deps.telemetry.events();
  for (const step of [STEP.scan, STEP.subwarp, STEP.dock, STEP.warp, STEP.torpedo, STEP.blastMiss, STEP.blastKill]) {
    assert.ok(events[step].ticks >= 1, `step ${step}`);
  }
});

test("the damage taken is what enemy fire took from shields and hull during the call", async () => {
  const deps = testDeps();

  const { results } = await playScript(deps);

  const taken = (index: number) => counter(results[index], "shield_damage") + counter(results[index], "hull_damage");
  const events = deps.telemetry.events();
  assert.ok(events[STEP.warp].damage_taken > 0);
  for (let index = 1; index < events.length; index++) {
    assert.equal(events[index].damage_taken, taken(index) - taken(index - 1));
  }
});

test("a scan's event counts the sectors it revealed", async () => {
  const deps = testDeps();

  await playScript(deps);

  assert.equal(deps.telemetry.events()[STEP.scan].sectors_revealed, 8);
});

test("a call that reveals nothing counts no sector revealed", async () => {
  const deps = testDeps();

  await playScript(deps);

  const events = deps.telemetry.events();
  assert.deepEqual([STEP.subwarp, STEP.warp, STEP.state].map((step) => events[step].sectors_revealed), [0, 0, 0]);
});

test("the shot that destroys a sector's last enemy counts one sector cleared, and no other call does", async () => {
  const deps = testDeps();

  await playScript(deps);

  const cleared = deps.telemetry.events().map((event) => event.sectors_cleared);
  assert.equal(cleared[STEP.blastKill], 1);
  assert.equal(cleared.reduce((sum, count) => sum + count, 0), 1);
});

test("a refused call is recorded as refused, taking no time and changing nothing", async () => {
  const deps = testDeps();

  await playScript(deps);

  const events = deps.telemetry.events();
  const refused = events[STEP.refusedBlast];
  const before = events[STEP.refusedBlast - 1];
  assert.deepEqual([refused.accepted, refused.refusal], [false, "No enemy in beam path"]);
  assert.deepEqual([refused.ticks, refused.damage_taken, refused.sectors_revealed, refused.sectors_cleared, refused.detail], [0, 0, 0, 0, {}]);
  assert.deepEqual([refused.startick, refused.energy, refused.shields, refused.hull, refused.torpedoes], [before.startick, before.energy, before.shields, before.hull, before.torpedoes]);
});

test("a read-only call is recorded as accepted, taking no time", async () => {
  const deps = testDeps();

  await playScript(deps);

  const events = deps.telemetry.events();
  for (const step of [STEP.galaxyMap, STEP.state]) {
    assert.deepEqual([events[step].accepted, events[step].refusal, events[step].ticks, events[step].detail], [true, null, 0, {}]);
  }
});

// R-39 (app layer): the in-memory PlayerStore adds increments to a player's totals and answers
// with the touched counters' totals before and after.

import assert from "node:assert/strict";
import { test } from "node:test";

import { MemoryPlayerStore } from "../../src/index.ts";

test("a player nobody added to has no totals", async () => {
  assert.deepEqual(await new MemoryPlayerStore().totals("alice"), {});
});

test("an addition returns the touched counters before and after, and the totals keep it", async () => {
  const store = new MemoryPlayerStore();

  const first = await store.add("alice", { docks: 2, hull_damage: 150 });
  const second = await store.add("alice", { docks: 3 });

  assert.deepEqual(first, { before: { docks: 0, hull_damage: 0 }, after: { docks: 2, hull_damage: 150 } });
  assert.deepEqual(second, { before: { docks: 2 }, after: { docks: 5 } });
  assert.deepEqual(await store.totals("alice"), { docks: 5, hull_damage: 150 });
});

test("each player has their own totals", async () => {
  const store = new MemoryPlayerStore();

  await store.add("alice", { docks: 2 });
  await store.add("bob", { docks: 7 });

  assert.deepEqual(await store.totals("alice"), { docks: 2 });
  assert.deepEqual(await store.totals("bob"), { docks: 7 });
});

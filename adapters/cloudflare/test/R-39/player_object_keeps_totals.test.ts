// R-39 (Cloudflare): a player's lifetime totals live in the Durable Object named by the player
// id, which keeps them between requests and adds one increment at a time.

import { env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";

import { DurableObjectPlayerStore } from "../../src/player_store.ts";
import { callTool, createGame } from "../helpers/worker.ts";
import { PLAYER } from "../helpers/tokens.ts";

test("a player nobody added to has no totals", async () => {
  expect(await new DurableObjectPlayerStore(env.PLAYERS).totals("player-unknown")).toEqual({});
});

test("the object keeps a player's totals between requests", async () => {
  const first = await new DurableObjectPlayerStore(env.PLAYERS).add("player-kept", { docks: 2, hull_damage: 150 });
  const second = await new DurableObjectPlayerStore(env.PLAYERS).add("player-kept", { docks: 3 });

  expect(first).toEqual({ before: { docks: 0, hull_damage: 0 }, after: { docks: 2, hull_damage: 150 } });
  expect(second).toEqual({ before: { docks: 2 }, after: { docks: 5 } });
  expect(await new DurableObjectPlayerStore(env.PLAYERS).totals("player-kept")).toEqual({ docks: 5, hull_damage: 150 });
});

test("each player id has its own totals", async () => {
  const store = new DurableObjectPlayerStore(env.PLAYERS);
  await store.add("player-a", { docks: 2 });
  await store.add("player-b", { docks: 7 });

  expect(await store.totals("player-a")).toEqual({ docks: 2 });
  expect(await store.totals("player-b")).toEqual({ docks: 7 });
});

test("additions made at once are all kept", async () => {
  const store = new DurableObjectPlayerStore(env.PLAYERS);

  await Promise.all(Array.from({ length: 25 }, () => store.add("player-busy", { scans: 1 })));

  expect(await store.totals("player-busy")).toEqual({ scans: 25 });
});

test("the totals live in the storage of the object named by the player id, a key per counter", async () => {
  await new DurableObjectPlayerStore(env.PLAYERS).add("player-stored", { docks: 4, scans: 1 });

  const stored = await runInDurableObject(env.PLAYERS.getByName("player-stored"), (_object, state) => [...state.storage.kv.list()]);

  expect(stored).toEqual([["docks", 4], ["scans", 1]]);
});

test("a signed-in player's command through the Worker adds to that player's totals", async () => {
  const store = new DurableObjectPlayerStore(env.PLAYERS);
  const { gameId } = await createGame();
  const before = await store.totals(PLAYER);

  const scan = await callTool("long_range_scan", { game_id: gameId });

  expect(scan.ok).toBe(true);
  const after = await store.totals(PLAYER);
  expect(after.scans).toBe(("scans" in before ? before.scans : 0) + 1);
});

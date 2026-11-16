// The Durable Object GameStore: a game put under a view_id comes back from that view_id's
// object with the player who started it, and from no other.

import { env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";

import { DurableObjectStore } from "../../src/store.ts";

const VIEW_A = "a".repeat(64);
const VIEW_B = "b".repeat(64);
const VIEW_OLD = "c".repeat(64);

test("an unknown view_id has no game", async () => {
  const store = new DurableObjectStore(env.GAMES);
  expect(await store.get("0".repeat(64))).toBeUndefined();
});

test("a game put under a view_id is read back with its player, and a later put replaces it", async () => {
  const store = new DurableObjectStore(env.GAMES);
  await store.put(VIEW_A, { game: '{"turn":1}', player: "player-a" });
  expect(await store.get(VIEW_A)).toEqual({ game: '{"turn":1}', player: "player-a" });
  await store.put(VIEW_A, { game: '{"turn":2}', player: "player-a" });
  expect(await store.get(VIEW_A)).toEqual({ game: '{"turn":2}', player: "player-a" });
});

test("each view_id has its own game", async () => {
  const store = new DurableObjectStore(env.GAMES);
  await store.put(VIEW_A, { game: '{"game":"a"}', player: "player-a" });
  await store.put(VIEW_B, { game: '{"game":"b"}', player: "player-b" });
  expect(await store.get(VIEW_A)).toEqual({ game: '{"game":"a"}', player: "player-a" });
  expect(await store.get(VIEW_B)).toEqual({ game: '{"game":"b"}', player: "player-b" });
});

test("the game and its player live in the storage of the object named by its view_id, a key each", async () => {
  await new DurableObjectStore(env.GAMES).put(VIEW_A, { game: '{"game":"stored"}', player: "player-a" });
  const stored = await runInDurableObject(env.GAMES.getByName(VIEW_A), (_object, state) => [...state.storage.kv.list()]);
  expect(stored).toEqual([["game", '{"game":"stored"}'], ["player", "player-a"]]);
});

test("a game stored with no player beside it is no game", async () => {
  await runInDurableObject(env.GAMES.getByName(VIEW_OLD), (_object, state) => state.storage.kv.put("game", '{"game":"old"}'));
  expect(await new DurableObjectStore(env.GAMES).get(VIEW_OLD)).toBeUndefined();
});

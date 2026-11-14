// The Durable Object GameStore: a game put under a view_id comes back from that view_id's
// object, and from no other.

import { env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";

import { DurableObjectStore } from "../../src/store.ts";

const VIEW_A = "a".repeat(64);
const VIEW_B = "b".repeat(64);

test("an unknown view_id has no game", async () => {
  const store = new DurableObjectStore(env.GAMES);
  expect(await store.get("0".repeat(64))).toBeUndefined();
});

test("a game put under a view_id is read back, and a later put replaces it", async () => {
  const store = new DurableObjectStore(env.GAMES);
  await store.put(VIEW_A, '{"turn":1}');
  expect(await store.get(VIEW_A)).toBe('{"turn":1}');
  await store.put(VIEW_A, '{"turn":2}');
  expect(await store.get(VIEW_A)).toBe('{"turn":2}');
});

test("each view_id has its own game", async () => {
  const store = new DurableObjectStore(env.GAMES);
  await store.put(VIEW_A, '{"game":"a"}');
  await store.put(VIEW_B, '{"game":"b"}');
  expect(await store.get(VIEW_A)).toBe('{"game":"a"}');
  expect(await store.get(VIEW_B)).toBe('{"game":"b"}');
});

test("the game lives in the storage of the object named by its view_id", async () => {
  await new DurableObjectStore(env.GAMES).put(VIEW_A, '{"game":"stored"}');
  const stored = await runInDurableObject(env.GAMES.getByName(VIEW_A), (_object, state) => state.storage.kv.get("game"));
  expect(stored).toBe('{"game":"stored"}');
  expect(await new DurableObjectStore(env.GAMES).get(VIEW_A)).toBe('{"game":"stored"}');
});

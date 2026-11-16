// R-25 (app layer): the Game-not-found result has the same five fields as every other result,
// and a stored game the core can't read is answered with it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { LOCAL_PLAYER, runCommand, viewId } from "../../src/index.ts";
import { call, connectClient, testDeps } from "../helpers/deps.ts";

/** A game as stored before the clock was counted in starticks, cut down to the old clock fields. */
const UNREADABLE_GAME = JSON.stringify({ seed: 7, stardate: 1234567.0, last_event_stardate: 1234567.0 });

test("not-found and core results share one shape", async () => {
  const client = await connectClient(testDeps());
  const fields = ["error", "events", "ok", "report", "state"];
  const created = await call(client, "new_game", {});
  const notFound = await call(client, "dock", { game_id: "missing" });
  assert.deepEqual(Object.keys(created).sort(), fields);
  assert.deepEqual(Object.keys(notFound).sort(), fields);
  assert.equal(notFound.report, null);
});

test("a stored game the core can't read is answered as not found, and nothing is published", async () => {
  const deps = testDeps();
  await deps.store.put(await viewId("old-game"), { game: UNREADABLE_GAME, player: LOCAL_PLAYER });

  const result = await runCommand(deps, "old-game", { type: "state" });

  assert.deepEqual(result, { ok: false, error: "Game not found", events: [], report: null, state: null });
  assert.deepEqual(deps.viewers.published, []);
  assert.deepEqual(await deps.store.get(await viewId("old-game")), { game: UNREADABLE_GAME, player: LOCAL_PLAYER });
});

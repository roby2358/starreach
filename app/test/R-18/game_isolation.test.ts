// R-18: games are addressed by game_id and isolated from each other.

import assert from "node:assert/strict";
import { test } from "node:test";

import { call, connectClient, testDeps } from "../helpers/deps.ts";

test("an unknown game_id returns Game not found", async () => {
  const client = await connectClient(testDeps());
  const result = await call(client, "state", { game_id: "no-such-game" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "Game not found");
  assert.equal(result.state, null);
});

test("a command on one game leaves another unchanged", async () => {
  const client = await connectClient(testDeps());
  const a = (await call(client, "new_game", {})).report!.game_id as string;
  const b = (await call(client, "new_game", {})).report!.game_id as string;
  assert.notEqual(a, b);
  const before = await call(client, "state", { game_id: b });

  const scan = await call(client, "long_range_scan", { game_id: a });
  assert.equal(scan.ok, true);

  assert.deepEqual(await call(client, "state", { game_id: b }), before);
  assert.notDeepEqual((await call(client, "state", { game_id: a })).state, before.state);
});

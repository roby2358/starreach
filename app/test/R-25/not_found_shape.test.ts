// R-25 (app layer): the Game-not-found result has the same five fields as every other result.

import assert from "node:assert/strict";
import { test } from "node:test";

import { call, connectClient, testDeps } from "../helpers/deps.ts";

test("not-found and core results share one shape", async () => {
  const client = await connectClient(testDeps());
  const fields = ["error", "events", "ok", "report", "state"];
  const created = await call(client, "new_game", {});
  const notFound = await call(client, "dock", { game_id: "missing" });
  assert.deepEqual(Object.keys(created).sort(), fields);
  assert.deepEqual(Object.keys(notFound).sort(), fields);
  assert.equal(notFound.report, null);
});

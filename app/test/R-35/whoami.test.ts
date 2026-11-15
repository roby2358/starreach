// R-35 (app layer): the whoami tool reports the player the adapter signed in, or that the
// connection has no sign-in.

import assert from "node:assert/strict";
import { test } from "node:test";

import { call, connectClient, testDeps } from "../helpers/deps.ts";

test("whoami on a connection without sign-in says so", async () => {
  const client = await connectClient(testDeps());
  assert.deepEqual(await call(client, "whoami", {}), { signed_in: false });
});

test("whoami on a signed-in connection gives the player's sub", async () => {
  const client = await connectClient({ ...testDeps(), player: "01PLAYER000000000000000001" });
  assert.deepEqual(await call(client, "whoami", {}), { signed_in: true, player: "01PLAYER000000000000000001" });
});

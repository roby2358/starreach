// R-36 (app layer): the core's counter table crosses the WASM boundary, and names exactly the
// counters a Result's state carries.

import assert from "node:assert/strict";
import { test } from "node:test";

import { newGame } from "../../src/index.ts";
import { testDeps } from "../helpers/deps.ts";

test("the counter table has a key, a label and a goal flag for every counter in a game's state", async () => {
  const deps = testDeps();
  const table = deps.core.counterTable();
  const counters = (await newGame(deps)).state!.counters as Record<string, number>;

  assert.deepEqual(table.map((row) => row.key).sort(), Object.keys(counters).sort());
  for (const row of table) {
    assert.equal(typeof row.label, "string");
    assert.equal(typeof row.may_be_goal, "boolean");
    assert.equal(counters[row.key], 0);
  }
});

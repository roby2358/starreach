// R-39 (app layer): a player's achievements are readable: for every counter of the counter
// table, the lifetime total, the last rung it reached and the next.

import assert from "node:assert/strict";
import { test } from "node:test";

import { achievements } from "../../src/index.ts";
import { testDeps } from "../helpers/deps.ts";

test("a player with no totals stands below the first rung of every counter", async () => {
  const deps = { ...testDeps(), player: "alice" };

  const rows = await achievements(deps);

  assert.deepEqual(rows.map((row) => row.key), deps.core.counterTable().map((row) => row.key));
  for (const [index, row] of deps.core.counterTable().entries()) {
    assert.deepEqual(rows[index], { key: row.key, label: row.label, total: 0, reached: null, next: row.scale });
  }
});

test("each counter shows its total, the last rung reached and the next", async () => {
  const deps = { ...testDeps(), player: "alice" };
  await deps.players.add("alice", { enemies_destroyed: 137, docks: 5, shield_damage: 999 });

  const rows = await achievements(deps);
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

  assert.deepEqual(byKey.enemies_destroyed, { key: "enemies_destroyed", label: "enemies destroyed", total: 137, reached: 100, next: 200 });
  assert.deepEqual(byKey.docks, { key: "docks", label: "docks at a starbase", total: 5, reached: 5, next: 10 });
  assert.deepEqual(byKey.shield_damage, { key: "shield_damage", label: "shield damage taken", total: 999, reached: null, next: 1000 });
});

test("with no sign-in the achievements are the local player's", async () => {
  const deps = testDeps();
  await deps.players.add("local", { scans: 2 });

  const scans = (await achievements(deps)).find((row) => row.key === "scans");

  assert.deepEqual(scans, { key: "scans", label: "long range scans", total: 2, reached: 2, next: 5 });
});

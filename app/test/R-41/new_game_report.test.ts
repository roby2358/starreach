// R-41 (app layer): new_game's report lists the game's three goals as its state shows them.

import assert from "node:assert/strict";
import { test } from "node:test";

import { newGame, type GoalState } from "../../src/index.ts";
import { call, connectClient, goalsOf, testDeps } from "../helpers/deps.ts";

test("new_game's report lists the three goals the state carries", async () => {
  const deps = testDeps();

  const created = await newGame(deps);

  const goals = created.report!.goals as GoalState[];
  assert.equal(goals.length, 3);
  assert.deepEqual(goals, goalsOf(created));
});

test("each reported goal is an unmet amount of a different counter that may be a goal, with its label", async () => {
  const deps = testDeps();
  const table = new Map(deps.core.counterTable().map((row) => [row.key, row]));

  const goals = (await newGame(deps)).report!.goals as GoalState[];

  assert.equal(new Set(goals.map((goal) => goal.counter)).size, 3);
  for (const goal of goals) {
    const row = table.get(goal.counter)!;
    assert.equal(row.may_be_goal, true);
    assert.equal(goal.label, row.label);
    assert.ok(goal.amount >= 1 && goal.amount <= row.goal_ceiling);
    assert.deepEqual([goal.count, goal.met], [0, false]);
  }
});

test("the goals reach the MCP caller in new_game's report, beside the game_id and the viewer's link", async () => {
  const client = await connectClient(testDeps());

  const created = await call(client, "new_game", {});

  assert.deepEqual(Object.keys(created.report!).sort(), ["game_id", "goals", "viewer_url"]);
  assert.deepEqual(created.report!.goals, goalsOf(created));
});

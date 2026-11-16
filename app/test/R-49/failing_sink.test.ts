// R-49 (app layer): a telemetry sink that fails doesn't fail the player's command.

import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { newGame, viewId, type Telemetry } from "../../src/index.ts";
import { TEST_CLIENT, testDeps } from "../helpers/deps.ts";
import { playOut, playScript, playToTheEnd, SCRIPT, SCRIPT_SEED, storeSeededGame } from "../helpers/telemetry.ts";

/** A sink every write to which fails. */
class FailingTelemetry implements Telemetry {
  async gameStarted(): Promise<void> {
    throw new Error("sink down");
  }

  async gameEnded(): Promise<void> {
    throw new Error("sink down");
  }

  async commandRun(): Promise<void> {
    throw new Error("sink down");
  }
}

/** Test deps over a failing sink, with the failures' log lines kept out of the test output. */
function failingDeps(t: TestContext): { deps: Omit<ReturnType<typeof testDeps>, "telemetry"> & { telemetry: Telemetry }; logged: () => number } {
  const log = t.mock.method(console, "error", () => {});
  return { deps: { ...testDeps(), telemetry: new FailingTelemetry() }, logged: () => log.mock.callCount() };
}

test("new_game answers and stores its game when the sink fails", async (t) => {
  const { deps } = failingDeps(t);

  const created = await newGame(deps, TEST_CLIENT);

  assert.equal(created.ok, true);
  assert.notEqual(await deps.store.get(await viewId(created.report!.game_id as string)), undefined);
});

test("every command gets the Result it gets with a working sink", async (t) => {
  const { deps } = failingDeps(t);

  const { results } = await playScript(deps);

  assert.deepEqual(results, (await playScript(testDeps())).results);
});

test("the game is stored as it is with a working sink", async (t) => {
  const { deps } = failingDeps(t);
  const working = testDeps();

  const { gameId } = await playScript(deps);
  await playScript(working);

  const view = await viewId(gameId);
  assert.deepEqual(await deps.store.get(view), await working.store.get(view));
});

test("the viewers still get a frame for every accepted command", async (t) => {
  const { deps } = failingDeps(t);

  const { results } = await playScript(deps);

  assert.equal(deps.viewers.published.length, results.filter((result) => result.ok).length);
});

test("a game can end while the sink fails", async (t) => {
  const { deps } = failingDeps(t);

  const { last } = await playToTheEnd(deps);

  assert.equal(last.state!.status, "lost");
});

test("each failed write is logged", async (t) => {
  const { deps, logged } = failingDeps(t);

  await playScript(deps);

  assert.equal(logged(), SCRIPT.length);
});

test("the in-memory sink refusing to end a game it has no record of fails only in the log", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const deps = testDeps();
  await storeSeededGame(deps, "never-started", SCRIPT_SEED);

  const last = await playOut(deps, "never-started");

  assert.equal(last.state!.status, "lost");
  assert.equal(log.mock.callCount(), 1);
});

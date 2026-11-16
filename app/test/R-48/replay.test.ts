// R-48 (app layer): a game replays from its telemetry alone. The game record's seed and start
// time and the accepted events' tools and arguments, in seq order, give the final stored Game.

import assert from "node:assert/strict";
import { test } from "node:test";

import { viewId, type Core, type EventRecord, type GameJson, type GameRecord } from "../../src/index.ts";
import { testDeps } from "../helpers/deps.ts";
import { onlyGame, playScript, playToTheEnd, SCRIPT_SEED } from "../helpers/telemetry.ts";

/** The Game that a start and a list of events give, by the core alone. */
function replay(core: Core, start: Pick<GameRecord, "seed" | "started_unix_seconds">, events: EventRecord[]): GameJson {
  const accepted = events.filter((event) => event.accepted).sort((a, b) => a.seq - b.seq);
  return accepted.reduce((game, event) => core.apply(game, { type: event.tool, ...event.args })!.game, core.newGame(start.seed, start.started_unix_seconds));
}

test("a game started with new_game and played to its end replays to the same final Game", async () => {
  const deps = testDeps();

  const { gameId } = await playToTheEnd(deps);

  const stored = await deps.store.get(await viewId(gameId));
  assert.equal(replay(deps.core, onlyGame(deps.telemetry), deps.telemetry.events()), stored!.game);
});

test("a game through every tool, refusals among them, replays to the same final Game", async () => {
  const deps = testDeps();
  const start = { seed: SCRIPT_SEED, started_unix_seconds: deps.unixSeconds() };

  const { gameId } = await playScript(deps);

  const stored = await deps.store.get(await viewId(gameId));
  assert.equal(replay(deps.core, start, deps.telemetry.events()), stored!.game);
});

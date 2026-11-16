// Game lookup (ONTOLOGY "Game lookup"): create, load, apply, store, tell the viewers.

import { awardLifetime, type Achievers } from "./achievements.ts";
import type { Command, CommandResult, Core, GameJson } from "./core.ts";
import type { Totals } from "./players.ts";
import type { GameStore } from "./store.ts";
import { viewerUrl, viewFrame, viewId, type Viewers } from "./view.ts";

export interface Games extends Achievers {
  store: GameStore;
  viewers: Viewers;
  /** Where browsers reach this server, such as http://localhost:8572. */
  viewOrigin: string;
  /** The real clock, in Unix seconds. A new game's stardate starts from it. */
  unixSeconds: () => number;
}

/** A new game under a random, unguessable game_id, stored under its view_id. The core's state query supplies the Result,
 *  so new_game has the same shape as every other tool, with the id and the viewer's link as
 *  its report. */
export async function newGame({ core, store, viewOrigin, unixSeconds }: Games): Promise<CommandResult> {
  const gameId = crypto.randomUUID();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const game = core.newGame(seed, unixSeconds());
  const view = await viewId(gameId);
  await store.put(view, game);
  const { result } = own(core.apply(game, { type: "state" }));
  return { ...result, report: { game_id: gameId, viewer_url: viewerUrl(viewOrigin, view) } };
}

/** Runs one command on a stored game, stores what the core returns, and tells its viewers. What
 *  an accepted command counted goes to the player's lifetime totals, and Star Central's message
 *  for each rung reached joins the Result's events. A stored game the core can't read is
 *  answered like an unknown one. */
export async function runCommand(games: Games, gameId: string, command: Command): Promise<CommandResult> {
  const { core, store, viewers } = games;
  const view = await viewId(gameId);
  const game = await store.get(view);
  if (game === undefined) {
    return gameNotFound();
  }
  const applied = core.apply(game, command);
  if (applied === undefined) {
    return gameNotFound();
  }
  const { result } = applied;
  if (!result.ok) {
    return result;
  }
  await store.put(view, applied.game);
  await viewers.publish(view, viewFrame(own(core.view(applied.game))));
  const commendations = await awardLifetime(games, counters(core, game), result.state!.counters as Totals);
  return { ...result, events: [...result.events, ...commendations] };
}

/** A stored game's counters, as the core's state query reports them. */
function counters(core: Core, game: GameJson): Totals {
  return own(core.apply(game, { type: "state" })).result.state!.counters as Totals;
}

/** What the core answered about a game it has just made, which it always reads. */
function own<T>(answer: T | undefined): T {
  if (answer === undefined) {
    throw new Error("The core can't read a game it just made");
  }
  return answer;
}

function gameNotFound(): CommandResult {
  return { ok: false, error: "Game not found", events: [], report: null, state: null };
}

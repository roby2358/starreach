// Game lookup (ONTOLOGY "Game lookup"): create, load, apply, store, tell the viewers.

import type { Command, CommandResult, Core } from "./core.ts";
import type { GameStore } from "./store.ts";
import { viewerUrl, viewFrame, viewId, type Viewers } from "./view.ts";

export interface Games {
  core: Core;
  store: GameStore;
  viewers: Viewers;
  /** Where browsers reach this server, such as http://localhost:8572. */
  viewOrigin: string;
}

/** A new game under a random, unguessable game_id, stored under its view_id. The core's state query supplies the Result,
 *  so new_game has the same shape as every other tool, with the id and the viewer's link as
 *  its report. */
export async function newGame({ core, store, viewOrigin }: Games): Promise<CommandResult> {
  const gameId = crypto.randomUUID();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const game = core.newGame(seed);
  const view = await viewId(gameId);
  await store.put(view, game);
  const { result } = core.apply(game, { type: "state" });
  return { ...result, report: { game_id: gameId, view_url: viewerUrl(viewOrigin, view) } };
}

/** Runs one command on a stored game, stores what the core returns, and tells its viewers. */
export async function runCommand({ core, store, viewers }: Games, gameId: string, command: Command): Promise<CommandResult> {
  const view = await viewId(gameId);
  const game = await store.get(view);
  if (game === undefined) {
    return gameNotFound();
  }
  const applied = core.apply(game, command);
  if (applied.result.ok) {
    await store.put(view, applied.game);
    await viewers.publish(view, viewFrame(core, applied.game));
  }
  return applied.result;
}

function gameNotFound(): CommandResult {
  return { ok: false, error: "Game not found", events: [], report: null, state: null };
}

// Game lookup (ONTOLOGY "Game lookup"): create, load, apply, store.

import type { Command, CommandResult, Core } from "./core.ts";
import type { GameStore } from "./store.ts";

export interface Games {
  core: Core;
  store: GameStore;
}

/** A new game under a random, unguessable id. The core's state query supplies the Result,
 *  so new_game has the same shape as every other tool, with the id as its report. */
export async function newGame({ core, store }: Games): Promise<CommandResult> {
  const gameId = crypto.randomUUID();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const game = core.newGame(seed);
  await store.put(gameId, game);
  const { result } = core.apply(game, { type: "state" });
  return { ...result, report: { game_id: gameId } };
}

/** Runs one command on a stored game and stores what the core returns. */
export async function runCommand({ core, store }: Games, gameId: string, command: Command): Promise<CommandResult> {
  const game = await store.get(gameId);
  if (game === undefined) {
    return gameNotFound();
  }
  const applied = core.apply(game, command);
  if (applied.result.ok) {
    await store.put(gameId, applied.game);
  }
  return applied.result;
}

function gameNotFound(): CommandResult {
  return { ok: false, error: "Game not found", events: [], report: null, state: null };
}

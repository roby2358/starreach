// Where games live between commands (ONTOLOGY GameStore). The core never sees it.

import type { GameJson } from "./core.ts";

/** A game as the store keeps it: the Game, and beside it the player who started it (D-49). */
export interface StoredGame {
  game: GameJson;
  /** Whose totals `new_game` ran for: the signed-in player's id, or the local player. */
  player: string;
}

export interface GameStore {
  get(viewId: string): Promise<StoredGame | undefined>;
  put(viewId: string, stored: StoredGame): Promise<void>;
}

/** Games in process memory, gone when the process ends. */
export class MemoryStore implements GameStore {
  private readonly games = new Map<string, StoredGame>();

  async get(viewId: string): Promise<StoredGame | undefined> {
    return this.games.get(viewId);
  }

  async put(viewId: string, stored: StoredGame): Promise<void> {
    this.games.set(viewId, stored);
  }
}

// Where games live between commands (ONTOLOGY GameStore). The core never sees it.

import type { GameJson } from "./core.ts";

export interface GameStore {
  get(gameId: string): Promise<GameJson | undefined>;
  put(gameId: string, game: GameJson): Promise<void>;
}

/** Games in process memory, gone when the process ends. */
export class MemoryStore implements GameStore {
  private readonly games = new Map<string, GameJson>();

  async get(gameId: string): Promise<GameJson | undefined> {
    return this.games.get(gameId);
  }

  async put(gameId: string, game: GameJson): Promise<void> {
    this.games.set(gameId, game);
  }
}

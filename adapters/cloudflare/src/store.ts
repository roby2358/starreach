// The app's GameStore over Durable Objects: each view_id names its own object.

import type { GameJson, GameStore } from "@starreach/app";

import type { GameObject } from "./game_object.ts";

export class DurableObjectStore implements GameStore {
  private readonly games: DurableObjectNamespace<GameObject>;

  constructor(games: DurableObjectNamespace<GameObject>) {
    this.games = games;
  }

  async get(viewId: string): Promise<GameJson | undefined> {
    return this.games.getByName(viewId).getGame();
  }

  async put(viewId: string, game: GameJson): Promise<void> {
    await this.games.getByName(viewId).putGame(game);
  }
}

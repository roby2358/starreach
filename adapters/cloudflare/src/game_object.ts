// One game's storage (ONTOLOGY GameStore): a SQLite-backed Durable Object named by the game's
// view_id (D-32), holding the game JSON under one key.

import { DurableObject } from "cloudflare:workers";

const GAME_KEY = "game";

export class GameObject extends DurableObject<Env> {
  getGame(): string | undefined {
    return this.ctx.storage.kv.get<string>(GAME_KEY);
  }

  putGame(game: string): void {
    this.ctx.storage.kv.put(GAME_KEY, game);
  }
}

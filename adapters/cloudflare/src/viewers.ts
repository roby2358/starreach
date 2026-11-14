// The app's Viewers over Durable Objects: a game's sockets live on the object its view_id names.

import type { Viewers } from "@starreach/app";

import type { GameObject } from "./game_object.ts";

export class DurableObjectViewers implements Viewers {
  private readonly games: DurableObjectNamespace<GameObject>;

  constructor(games: DurableObjectNamespace<GameObject>) {
    this.games = games;
  }

  async publish(viewId: string, frame: string): Promise<void> {
    await this.games.getByName(viewId).publish(frame);
  }
}

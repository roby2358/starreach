// The app's PlayerStore over Durable Objects: each player id names its own object.

import type { PlayerStore, Totals, TotalsChange } from "@starreach/app";

import type { PlayerObject } from "./player_object.ts";

export class DurableObjectPlayerStore implements PlayerStore {
  private readonly players: DurableObjectNamespace<PlayerObject>;

  constructor(players: DurableObjectNamespace<PlayerObject>) {
    this.players = players;
  }

  async totals(player: string): Promise<Totals> {
    return this.players.getByName(player).totals();
  }

  async add(player: string, increments: Totals): Promise<TotalsChange> {
    return this.players.getByName(player).add(increments);
  }
}

// One player on Cloudflare: a SQLite-backed Durable Object named by the player's id (D-45).
// It holds the player's lifetime totals, a key of its key-value storage per counter (ONTOLOGY
// PlayerStore). Its storage calls are synchronous, so an addition reads and writes with no other
// request in between and none is lost.

import { DurableObject } from "cloudflare:workers";
import { addTotals, type Totals, type TotalsChange } from "@starreach/app";

export class PlayerObject extends DurableObject<Env> {
  totals(): Totals {
    return Object.fromEntries(this.ctx.storage.kv.list<number>());
  }

  add(increments: Totals): TotalsChange {
    const change = addTotals(this.totals(), increments);
    for (const [key, total] of Object.entries(change.after)) {
      this.ctx.storage.kv.put(key, total);
    }
    return change;
  }
}

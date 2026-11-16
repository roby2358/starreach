// A player's lifetime totals (ONTOLOGY PlayerStore, D-45): counter key to total, over all of
// the player's games. The core never sees it.

/** Counter key to a count: a player's totals, or what one command added to them. */
export type Totals = Record<string, number>;

/** The totals of the counters an addition touched, before it and after it. */
export interface TotalsChange {
  before: Totals;
  after: Totals;
}

export interface PlayerStore {
  /** The player's totals. A counter the player never added to is absent. */
  totals(player: string): Promise<Totals>;
  /** Adds the increments to the player's totals, one addition at a time. */
  add(player: string, increments: Totals): Promise<TotalsChange>;
}

/** Who owns the totals where there is no sign-in: one local player for the life of the process. */
export const LOCAL_PLAYER = "local";

/** The player a command's counts go to: the signed-in one, or the local player. */
export function totalsOwner(player: string | null): string {
  return player === null ? LOCAL_PLAYER : player;
}

/** A counter's total. One the player never added to stands at 0. */
export function totalOf(totals: Totals, key: string): number {
  return key in totals ? totals[key] : 0;
}

/** The addition every PlayerStore makes: for each counter in `increments`, its total before
 *  and after. */
export function addTotals(current: Totals, increments: Totals): TotalsChange {
  const before: Totals = {};
  const after: Totals = {};
  for (const [key, increment] of Object.entries(increments)) {
    before[key] = totalOf(current, key);
    after[key] = before[key] + increment;
  }
  return { before, after };
}

/** Totals in process memory, gone when the process ends. */
export class MemoryPlayerStore implements PlayerStore {
  private readonly players = new Map<string, Totals>();

  async totals(player: string): Promise<Totals> {
    return { ...this.players.get(player) };
  }

  async add(player: string, increments: Totals): Promise<TotalsChange> {
    const current = await this.totals(player);
    const change = addTotals(current, increments);
    this.players.set(player, { ...current, ...change.after });
    return change;
  }
}

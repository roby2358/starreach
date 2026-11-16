// Achievements (ONTOLOGY "Lifetime totals", D-44): what a command counted goes to its player's
// lifetime totals, and each rung a total reaches is announced by Star Central.

import type { Core } from "./core.ts";
import { totalOf, totalsOwner, type PlayerStore, type Totals } from "./players.ts";

export interface Achievers {
  core: Core;
  players: PlayerStore;
  /** The signed-in player's auth/ `sub`, or null on an endpoint without sign-in. */
  player: string | null;
  /** A number in [0, 1), drawn outside any game: it picks a message's wording. */
  random: () => number;
}

/** One counter of a player's achievements: the lifetime total, the last rung it reached (null
 *  below the first) and the next one. */
export interface Achievement {
  key: string;
  label: string;
  total: number;
  reached: number | null;
  next: number;
}

/** What a command counted: each counter that rose between two of a game's states, by how much. */
function increments(before: Totals, after: Totals): Totals {
  const moved = Object.keys(after).filter((key) => after[key] > before[key]);
  return Object.fromEntries(moved.map((key) => [key, after[key] - before[key]]));
}

/** Adds what a command counted to its player's lifetime totals and returns Star Central's
 *  message for each rung a total reached, in the counter table's order and rising within a
 *  counter. `before` and `after` are the game's counters on either side of the command. */
export async function awardLifetime({ core, players, player, random }: Achievers, before: Totals, after: Totals): Promise<string[]> {
  const counted = increments(before, after);
  if (Object.keys(counted).length === 0) {
    return [];
  }
  const change = await players.add(totalsOwner(player), counted);
  return core
    .counterTable()
    .filter((row) => row.key in counted)
    .flatMap((row) =>
      core
        .rungsCrossed(row.key, change.before[row.key], change.after[row.key])
        .map((rung) => core.commendation(row.key, rung, random())),
    );
}

/** The player's achievements, a row per counter in the counter table's order. */
export async function achievements({ core, players, player }: Pick<Achievers, "core" | "players" | "player">): Promise<Achievement[]> {
  const totals = await players.totals(totalsOwner(player));
  return core.counterTable().map((row) => {
    const total = totalOf(totals, row.key);
    return { key: row.key, label: row.label, total, ...core.ladderStanding(row.key, total) };
  });
}

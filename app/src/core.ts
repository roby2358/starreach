// The Rust core behind its JSON boundary (ONTOLOGY "Core API").
// The app never reads a Game's fields: a Game travels as the JSON text the core produced.

import { initSync, new_game, apply, view, counter_table, rungs_crossed, ladder_standing, commendation } from "./wasm/starreach_core.js";

/** A Game as JSON text, opaque to the app layer. */
export type GameJson = string;

/** The one result shape (D-29). `state` is null only for an unknown game_id. */
export interface CommandResult {
  ok: boolean;
  error: string | null;
  events: string[];
  report: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
}

/** `{type, ...args}`, as ONTOLOGY's Commands table lists them. */
export interface Command {
  type: string;
  [arg: string]: unknown;
}

/** What a read-only display may see of a Game (ONTOLOGY GameView). A hidden sector is null. */
export interface GameView {
  status: string;
  /** The game clock as a stardate, `ddd.dddd.dd.d`. */
  stardate: string;
  /** The ship's sector, `[x, y]`: column, then row. */
  sector_xy: [number, number];
  ship: Record<string, number>;
  /** The ship's sector, a row per string, as in the state's `map`. */
  board: string[];
  galaxy: ({ enemies: number; starbases: number; stars: number } | null)[][];
  /** The game's goals with their progress, as the state's `goals`. */
  goals: GoalState[];
}

/** One row of the core's counter table: a counter a game keeps (`state.counters[key]`), its label,
 *  which reads after a number, whether it may be a game's goal, the unit of its ladder of lifetime
 *  totals (1, 10, 100 or 1000), and the most a goal may ask of it (0: not offered as a goal). */
export interface CounterRow {
  key: string;
  label: string;
  may_be_goal: boolean;
  scale: number;
  goal_ceiling: number;
}

/** One of a game's goals as a Result's `state.goals` and new_game's `report.goals` show it: the
 *  counter's key and label, this game's count on it so far, the amount to reach, and whether it
 *  has been met (ONTOLOGY Goal). */
export interface GoalState {
  counter: string;
  label: string;
  count: number;
  amount: number;
  met: boolean;
}

/** Where a lifetime total stands on its counter's ladder: the last rung it reached (null below
 *  the first) and the next one. */
export interface LadderStanding {
  reached: number | null;
  next: number;
}

/** `apply` and `view` return undefined for text that isn't a Game this core reads, such as a
 *  game stored by an earlier version. */
export interface Core {
  /** `startUnixSeconds` is the real time the game's stardate starts from. The core reads no clock. */
  newGame(seed: number, startUnixSeconds: number): GameJson;
  apply(game: GameJson, command: Command): { game: GameJson; result: CommandResult } | undefined;
  view(game: GameJson): GameView | undefined;
  /** The single list of counters, in the core's order. */
  counterTable(): CounterRow[];
  /** The rungs of the counter's ladder that a lifetime total reached in going from `before` to
   *  `after`, in rising order. Throws for a key that names no counter, as the next two do. */
  rungsCrossed(key: string, before: number, after: number): number[];
  ladderStanding(key: string, total: number): LadderStanding;
  /** Star Central's message for the counter's lifetime total reaching the rung `amount`. `roll`,
   *  in [0, 1), picks one of the kind's wordings. */
  commendation(key: string, amount: number, roll: number): string;
}

/** What the core answered about a counter, which it does for every key of its own table. */
function known(answer: string | undefined, key: string): string {
  if (answer === undefined) {
    throw new Error(`The core has no counter "${key}"`);
  }
  return answer;
}

/** Instantiates the core from its compiled WASM module. Each platform loads the module its own way. */
export function loadCore(module: WebAssembly.Module): Core {
  initSync({ module });
  return {
    newGame: (seed, startUnixSeconds) => new_game(seed, startUnixSeconds),
    apply: (game, command) => {
      const text = apply(game, JSON.stringify(command));
      if (text === undefined) {
        return undefined;
      }
      const applied = JSON.parse(text);
      return { game: JSON.stringify(applied.game), result: applied.result };
    },
    view: (game) => {
      const text = view(game);
      return text === undefined ? undefined : JSON.parse(text);
    },
    counterTable: () => JSON.parse(counter_table()),
    rungsCrossed: (key, before, after) => JSON.parse(known(rungs_crossed(key, before, after), key)),
    ladderStanding: (key, total) => JSON.parse(known(ladder_standing(key, total), key)),
    commendation: (key, amount, roll) => known(commendation(key, amount, roll), key),
  };
}

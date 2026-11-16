// The Rust core behind its JSON boundary (ONTOLOGY "Core API").
// The app never reads a Game's fields: a Game travels as the JSON text the core produced.

import { initSync, new_game, apply, view } from "./wasm/starreach_core.js";

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
  sector_yx: [number, number];
  ship: Record<string, number>;
  /** The ship's sector, a row per string, as in the state's `map`. */
  board: string[];
  galaxy: ({ enemies: number; starbases: number; stars: number } | null)[][];
}

/** `apply` and `view` return undefined for text that isn't a Game this core reads, such as a
 *  game stored by an earlier version. */
export interface Core {
  /** `startUnixSeconds` is the real time the game's stardate starts from. The core reads no clock. */
  newGame(seed: number, startUnixSeconds: number): GameJson;
  apply(game: GameJson, command: Command): { game: GameJson; result: CommandResult } | undefined;
  view(game: GameJson): GameView | undefined;
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
  };
}

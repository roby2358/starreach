// Shared setup for the telemetry tests: a seeded game played through a fixed list of commands
// that uses every tool and is refused three times, and a game played until it ends.

import { newGame, runCommand, viewId, type Command, type CommandResult, type Games, type GameRecord, type MemoryTelemetry } from "../../src/index.ts";
import { START_UNIX_SECONDS, TEST_CLIENT } from "./deps.ts";

export type Recording = Games & { telemetry: MemoryTelemetry };

/** The seed of the scripted game. Its galaxy has two enemies at sector (5, 3). */
export const SCRIPT_SEED = 7;

/** Every tool, with a blast that misses and one that kills, a torpedo, and three refusals. */
export const SCRIPT: Command[] = [
  { type: "long_range_scan" },
  { type: "subwarp", x: 7, y: 9 },
  { type: "dock" },
  { type: "galaxy_warp", x: 5, y: 3 },
  { type: "torpedo", x: 3, y: 0 },
  { type: "blast", x: 5, y: 6 },
  { type: "subwarp", x: 7, y: 4 },
  { type: "blast", x: 5, y: 6 },
  { type: "blast", x: 5, y: 6 },
  { type: "subwarp", x: 10, y: 2 },
  { type: "torpedo", x: 9, y: 9 },
  { type: "long_range_scan" },
  { type: "galaxy_map" },
  { type: "galaxy_warp", x: 4, y: 4 },
  { type: "state" },
];

/** Where each kind of call sits in SCRIPT. */
export const STEP = { scan: 0, subwarp: 1, dock: 2, warp: 3, torpedo: 4, blastMiss: 5, blastKill: 7, refusedBlast: 8, galaxyMap: 12, state: 14 };

/** Stores the game of `seed`, started at the tests' start time, under `gameId`. Telemetry gets
 *  no game record for it: only `new_game` writes one. */
export async function storeSeededGame(deps: Games, gameId: string, seed: number): Promise<void> {
  await deps.store.put(await viewId(gameId), { game: deps.core.newGame(seed, START_UNIX_SECONDS), player: "seeded" });
}

/** Runs the commands on a game in order and returns their Results. */
export async function play(deps: Games, gameId: string, commands: Command[]): Promise<CommandResult[]> {
  const results: CommandResult[] = [];
  for (const command of commands) {
    results.push(await runCommand(deps, gameId, command));
  }
  return results;
}

/** The scripted game, played: its game_id and the Result of each command of SCRIPT. */
export async function playScript(deps: Games): Promise<{ gameId: string; results: CommandResult[] }> {
  const gameId = "scripted-game";
  await storeSeededGame(deps, gameId, SCRIPT_SEED);
  return { gameId, results: await play(deps, gameId, SCRIPT) };
}

/** The most scans a full tank pays for, with room to spare. */
const SCANS_TO_RUN_DRY = 200;

/** Plays a new game until it ends, whatever its seed: a warp to the sector beside Star Central,
 *  which never has a starbase, then long range scans until the ship is destroyed or too low on
 *  energy to reach a starbase. Returns the last Result. */
export async function playOut(deps: Games, gameId: string): Promise<CommandResult> {
  let last = await runCommand(deps, gameId, { type: "galaxy_warp", x: 5, y: 4 });
  for (let scans = 0; scans < SCANS_TO_RUN_DRY && last.state!.status === "playing"; scans++) {
    last = await runCommand(deps, gameId, { type: "long_range_scan" });
  }
  if (last.state!.status === "playing") {
    throw new Error("The game did not end");
  }
  return last;
}

/** Starts a game with `new_game` and plays it out. Returns the game_id and the last Result. */
export async function playToTheEnd(deps: Games): Promise<{ gameId: string; last: CommandResult }> {
  const gameId = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;
  return { gameId, last: await playOut(deps, gameId) };
}

/** Starts a game with `new_game`, so telemetry has its record, then puts the game of `seed` in
 *  its place, so what follows doesn't depend on chance. The record keeps the seed `new_game` drew. */
export async function startSeeded(deps: Games, seed: number): Promise<string> {
  const gameId = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;
  await rewriteStored(deps, gameId, () => JSON.parse(deps.core.newGame(seed, START_UNIX_SECONDS)));
  return gameId;
}

/** Replaces a stored game with what `rewrite` makes of its fields. */
export async function rewriteStored(deps: Games, gameId: string, rewrite: (game: any) => unknown): Promise<void> {
  const view = await viewId(gameId);
  const stored = (await deps.store.get(view))!;
  await deps.store.put(view, { ...stored, game: JSON.stringify(rewrite(JSON.parse(stored.game))) });
}

/** The one game record a sink holds. */
export function onlyGame(telemetry: MemoryTelemetry): GameRecord {
  const games = telemetry.games();
  if (games.length !== 1) {
    throw new Error(`Expected one game record, found ${games.length}`);
  }
  return games[0];
}

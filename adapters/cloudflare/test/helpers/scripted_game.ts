// A seeded game played through the Worker: the game is put in the Durable Object store under a
// game_id of the test's own, as `new_game` would store it, so what its commands do doesn't
// depend on chance. Telemetry gets no game row for it: only `new_game` writes one.

import { env } from "cloudflare:workers";
import { viewId, type Command, type CommandResult } from "@starreach/app";

import { core } from "../../src/core.ts";
import { DurableObjectStore } from "../../src/store.ts";
import { PLAYER } from "./tokens.ts";
import { callTool } from "./worker.ts";

/** The seed of the scripted game, the one the app layer's telemetry tests play. Its galaxy has
 *  two enemies at sector (5, 3). */
const SCRIPT_SEED = 7;

/** The real time the scripted game starts at: midnight on Unix day 20773. */
const START_UNIX_SECONDS = 20_773 * 86_400;

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
export const STEP = { scan: 0, subwarp: 1, dock: 2, warp: 3, torpedo: 4, blastMiss: 5, blastKill: 7, refusedBlast: 8 };

/** One command sent to the Worker as its MCP tool call. */
export function command(gameId: string, { type, ...args }: Command): Promise<CommandResult> {
  return callTool(type, { game_id: gameId, ...args });
}

/** Stores the scripted game under a new game_id and plays SCRIPT on it through the Worker.
 *  Returns the game_id and each command's Result. */
export async function playScript(): Promise<{ gameId: string; results: CommandResult[] }> {
  const gameId = crypto.randomUUID();
  await new DurableObjectStore(env.GAMES).put(await viewId(gameId), { game: core.newGame(SCRIPT_SEED, START_UNIX_SECONDS), player: PLAYER });
  const results: CommandResult[] = [];
  for (const step of SCRIPT) {
    results.push(await command(gameId, step));
  }
  return { gameId, results };
}

/** Energy for a scan or two: what `playOut` leaves the ship, so the game ends in a few calls. */
const NEARLY_DRY = 1000;

/** More scans than `NEARLY_DRY` pays for. */
const SCANS_TO_RUN_DRY = 20;

/** Replaces a stored game's ship energy. */
async function setEnergy(gameId: string, energy: number): Promise<void> {
  const store = new DurableObjectStore(env.GAMES);
  const view = await viewId(gameId);
  const stored = (await store.get(view))!;
  const game = JSON.parse(stored.game);
  await store.put(view, { ...stored, game: JSON.stringify({ ...game, ship: { ...game.ship, energy } }) });
}

/** Plays a game until it ends, whatever its seed: a warp to the sector beside Star Central,
 *  which never has a starbase, then, the stored ship drained to `NEARLY_DRY`, long range scans
 *  until the ship is destroyed or too low on energy to reach a starbase. Returns every Result,
 *  the last one the game's end. */
export async function playOut(gameId: string): Promise<CommandResult[]> {
  const results = [await command(gameId, { type: "galaxy_warp", x: 5, y: 4 })];
  await setEnergy(gameId, NEARLY_DRY);
  for (let scans = 0; scans < SCANS_TO_RUN_DRY && results.at(-1)!.state!.status === "playing"; scans++) {
    results.push(await command(gameId, { type: "long_range_scan" }));
  }
  if (results.at(-1)!.state!.status === "playing") {
    throw new Error("The game did not end");
  }
  return results;
}

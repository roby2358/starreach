// Game lookup (ONTOLOGY "Game lookup"): create, load, apply, store, tell the viewers.

import { awardLifetime, type Achievers } from "./achievements.ts";
import type { Command, CommandResult, Core, GameJson } from "./core.ts";
import { totalsOwner, type Totals } from "./players.ts";
import type { GameStore, StoredGame } from "./store.ts";
import { recordCommand, recordGameStart, type McpClient, type Telemetry } from "./telemetry.ts";
import { viewerUrl, viewFrame, viewId, type Viewers } from "./view.ts";

export interface Games extends Achievers {
  store: GameStore;
  viewers: Viewers;
  /** Where the telemetry records of games and tool calls go (D-51). */
  telemetry: Telemetry;
  /** Where browsers reach this server, such as http://localhost:8572. */
  viewOrigin: string;
  /** The real clock, in Unix seconds. A new game's stardate starts from it. */
  unixSeconds: () => number;
}

/** A new game under a random, unguessable game_id, stored under its view_id with the player who
 *  started it beside it. The core's state query supplies the Result,
 *  so new_game has the same shape as every other tool, with the id, the game's goals as its
 *  state shows them, and the viewer's link as its report. Telemetry gets the game's record, with
 *  `client` as what is known of the MCP client that asked. */
export async function newGame(games: Games, client: McpClient): Promise<CommandResult> {
  const { core, store, viewOrigin } = games;
  const gameId = crypto.randomUUID();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const startedUnixSeconds = games.unixSeconds();
  const game = core.newGame(seed, startedUnixSeconds);
  const view = await viewId(gameId);
  const player = totalsOwner(games.player);
  await store.put(view, { game, player });
  await recordGameStart(games, gameId, seed, startedUnixSeconds, player, client);
  const { result } = own(core.apply(game, { type: "state" }));
  return { ...result, report: { game_id: gameId, goals: result.state!.goals, viewer_url: viewerUrl(viewOrigin, view) } };
}

/** Runs one command on a stored game, stores what the core returns, and tells its viewers. What
 *  an accepted command counted goes to the commanding player's lifetime totals, and Star
 *  Central's message for each rung reached joins the Result's events, after the core's own, which
 *  end with any goal of the game the command met. The viewers' frame is made after the totals
 *  move, so its achievements include this command. A stored game the core can't read is
 *  answered like an unknown one. Telemetry gets an event for every command on a game the core
 *  reads, refused or not, once an accepted one is stored. */
export async function runCommand(games: Games, gameId: string, command: Command): Promise<CommandResult> {
  const { core, store, viewers } = games;
  const view = await viewId(gameId);
  const stored = await store.get(view);
  if (stored === undefined) {
    return gameNotFound();
  }
  const applied = core.apply(stored.game, command);
  if (applied === undefined) {
    return gameNotFound();
  }
  const { result } = applied;
  if (!result.ok) {
    await recordCommand(games, gameId, command, stored.game, applied);
    return result;
  }
  const played: StoredGame = { game: applied.game, player: stored.player };
  await store.put(view, played);
  await recordCommand(games, gameId, command, stored.game, applied);
  const commendations = await awardLifetime(games, counters(core, stored.game), result.state!.counters as Totals);
  await viewers.publish(view, own(await viewFrame(games, played)));
  return { ...result, events: [...result.events, ...commendations] };
}

/** A stored game's counters, as the core's state query reports them. */
function counters(core: Core, game: GameJson): Totals {
  return own(core.apply(game, { type: "state" })).result.state!.counters as Totals;
}

/** What the core answered about a game it has just made, which it always reads. */
function own<T>(answer: T | undefined): T {
  if (answer === undefined) {
    throw new Error("The core can't read a game it just made");
  }
  return answer;
}

function gameNotFound(): CommandResult {
  return { ok: false, error: "Game not found", events: [], report: null, state: null };
}

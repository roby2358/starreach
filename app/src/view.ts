// The read-only display (ONTOLOGY "Viewers", D-31): what goes down a viewer's socket. The app
// layer only makes frames. Each adapter owns the sockets, because upgrading a request and
// holding a socket are the platform's business.

import { achievements, type Achievement, type Achievers } from "./achievements.ts";
import type { GameView } from "./core.ts";
import { sha256Hex } from "./hash.ts";
import type { GameStore, StoredGame } from "./store.ts";

/** The sockets watching each game. Nothing comes back from a viewer. */
export interface Viewers {
  publish(viewIdValue: string, frame: string): Promise<void>;
}

/** Everything on a viewer's socket is a frame with a `type`, so other kinds can join it. A view
 *  frame carries the game's view and the achievements of the player who started the game, as
 *  rows and never with the player's id (D-49). */
export type Frame = { type: "view"; view: GameView; achievements: Achievement[] };

/** What making a frame needs: the core for the view, and the players' totals for the achievements. */
export type FrameMakers = Pick<Achievers, "core" | "players">;

/** The WebSocket close code for an unknown game. A browser can't read an HTTP status from a
 *  failed upgrade, so the socket opens and then closes with this. */
export const GAME_NOT_FOUND_CLOSE = 4404;

/** A viewer has nothing to say beyond a small ping, so any frame bigger than this closes its
 *  socket (R-27). */
export const VIEWER_MAX_FRAME_BYTES = 128;

/** The WebSocket close code for a frame over VIEWER_MAX_FRAME_BYTES (RFC 6455 "message too big"). */
export const FRAME_TOO_BIG_CLOSE = 1009;

const LIVE_PATH = /^\/live\/([0-9a-f]{64})$/;

/** The view_id for a game_id: its hex SHA-256 (D-32). The store and the viewers are keyed by
 *  it, so the one place a game_id is accepted is where it is hashed, and a view_id can't be
 *  turned back into a game_id or used to play. */
export function viewId(gameId: string): Promise<string> {
  return sha256Hex(gameId);
}

/** The view_id a `/live/<view_id>` path watches, or undefined for any other path. */
export function liveViewId(path: string): string | undefined {
  return LIVE_PATH.exec(path)?.[1];
}

export function viewerUrl(origin: string, viewIdValue: string): string {
  return `${origin}/viewer?view=${viewIdValue}`;
}

/** A stored game's view frame, or undefined for a stored game the core can't read. The
 *  achievements are read when the frame is made, so they are the starting player's as they
 *  stand now. */
export async function viewFrame(makers: FrameMakers, { game, player }: StoredGame): Promise<string | undefined> {
  const view = makers.core.view(game);
  if (view === undefined) {
    return undefined;
  }
  const frame: Frame = { type: "view", view, achievements: await achievements(makers, player) };
  return JSON.stringify(frame);
}

/** The frame a viewer gets on connecting, or undefined for an unknown game or a stored game the
 *  core can't read. */
export async function currentFrame(makers: FrameMakers & { store: GameStore }, viewIdValue: string): Promise<string | undefined> {
  const stored = await makers.store.get(viewIdValue);
  return stored === undefined ? undefined : viewFrame(makers, stored);
}

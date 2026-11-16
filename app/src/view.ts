// The read-only display (ONTOLOGY "Viewers", D-31): what goes down a viewer's socket. The app
// layer only makes frames. Each adapter owns the sockets, because upgrading a request and
// holding a socket are the platform's business.

import type { Core, GameView } from "./core.ts";
import type { GameStore } from "./store.ts";

/** The sockets watching each game. Nothing comes back from a viewer. */
export interface Viewers {
  publish(viewIdValue: string, frame: string): Promise<void>;
}

/** Everything on a viewer's socket is a frame with a `type`, so other kinds can join it. */
export type Frame = { type: "view"; view: GameView };

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
export async function viewId(gameId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(gameId));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The view_id a `/live/<view_id>` path watches, or undefined for any other path. */
export function liveViewId(path: string): string | undefined {
  return LIVE_PATH.exec(path)?.[1];
}

export function viewerUrl(origin: string, viewIdValue: string): string {
  return `${origin}/viewer?view=${viewIdValue}`;
}

export function viewFrame(view: GameView): string {
  const frame: Frame = { type: "view", view };
  return JSON.stringify(frame);
}

/** The frame a viewer gets on connecting, or undefined for an unknown game or a stored game the
 *  core can't read. */
export async function currentFrame(
  { core, store }: { core: Core; store: GameStore },
  viewIdValue: string,
): Promise<string | undefined> {
  const game = await store.get(viewIdValue);
  const view = game === undefined ? undefined : core.view(game);
  return view === undefined ? undefined : viewFrame(view);
}

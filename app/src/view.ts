// The read-only display (ONTOLOGY "Viewers", D-31): what goes down a viewer's socket. The app
// layer only makes frames. Each adapter owns the sockets, because upgrading a request and
// holding a socket are the platform's business.

import type { Core, GameJson, GameView } from "./core.ts";
import type { GameStore } from "./store.ts";

/** The sockets watching each game. Nothing comes back from a viewer. */
export interface Viewers {
  publish(gameId: string, frame: string): Promise<void>;
}

/** Everything on a viewer's socket is a frame with a `type`, so other kinds can join it. */
export type Frame = { type: "view"; view: GameView };

/** The WebSocket close code for an unknown game. A browser can't read an HTTP status from a
 *  failed upgrade, so the socket opens and then closes with this. */
export const GAME_NOT_FOUND_CLOSE = 4404;

const LIVE_PATH = /^\/live\/([0-9a-f-]{36})$/;

/** The game a `/live/<game_id>` path watches, or undefined for any other path. */
export function liveGameId(path: string): string | undefined {
  return LIVE_PATH.exec(path)?.[1];
}

export function viewerUrl(origin: string, gameId: string): string {
  return `${origin}/?game=${gameId}`;
}

export function viewFrame(core: Core, game: GameJson): string {
  const frame: Frame = { type: "view", view: core.view(game) };
  return JSON.stringify(frame);
}

/** The frame a viewer gets on connecting, or undefined for an unknown game. */
export async function currentFrame(
  { core, store }: { core: Core; store: GameStore },
  gameId: string,
): Promise<string | undefined> {
  const game = await store.get(gameId);
  return game === undefined ? undefined : viewFrame(core, game);
}

// One game on Cloudflare: a SQLite-backed Durable Object named by the game's view_id (D-32).
// It holds the game JSON under one key (ONTOLOGY GameStore) and the game's viewer sockets
// (ONTOLOGY Viewers, D-31). The sockets use the hibernation API, so the object can leave
// memory while viewers stay connected.

import { DurableObject } from "cloudflare:workers";
import {
  currentFrame,
  FRAME_TOO_BIG_CLOSE,
  GAME_NOT_FOUND_CLOSE,
  liveViewId,
  VIEWER_MAX_FRAME_BYTES,
  type GameJson,
  type GameStore,
} from "@starreach/app";

import { core } from "./core.ts";

const GAME_KEY = "game";

export class GameObject extends DurableObject<Env> {
  /** This object's own game as a GameStore. The object is already the one its view_id names. */
  private readonly ownGame: GameStore = {
    get: async () => this.getGame(),
    put: async (_viewId: string, game: GameJson) => this.putGame(game),
  };

  getGame(): string | undefined {
    return this.ctx.storage.kv.get<string>(GAME_KEY);
  }

  putGame(game: string): void {
    this.ctx.storage.kv.put(GAME_KEY, game);
  }

  /** Sends a frame to every viewer of this game. */
  publish(frame: string): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(frame);
      }
    }
  }

  /** A viewer's socket upgrade, which the Worker routes here by view_id. A browser can't read
   *  an HTTP status from a failed upgrade, so an unknown game opens and then closes. */
  async fetch(request: Request): Promise<Response> {
    const view = liveViewId(new URL(request.url).pathname);
    if (view === undefined) {
      return new Response("Not found", { status: 404 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    const upgraded = new Response(null, { status: 101, webSocket: client });
    const frame = await currentFrame({ core, store: this.ownGame }, view);
    if (frame === undefined) {
      server.accept();
      server.close(GAME_NOT_FOUND_CLOSE, "Game not found");
      return upgraded;
    }
    this.ctx.acceptWebSocket(server);
    server.send(frame);
    return upgraded;
  }

  /** A viewer has nothing to say (R-27): a frame over VIEWER_MAX_FRAME_BYTES closes that
   *  socket, and any other frame is dropped. */
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (frameBytes(message) > VIEWER_MAX_FRAME_BYTES) {
      socket.close(FRAME_TOO_BIG_CLOSE, "Frame too big");
    }
  }

  /** The runtime answers a viewer's close frame itself and drops the socket from
   *  getWebSockets, so there is nothing to do. */
  webSocketClose(): void {}
}

function frameBytes(message: string | ArrayBuffer): number {
  return typeof message === "string" ? new TextEncoder().encode(message).byteLength : message.byteLength;
}

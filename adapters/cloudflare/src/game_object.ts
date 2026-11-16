// One game on Cloudflare: a SQLite-backed Durable Object named by the game's view_id (D-32).
// It holds the game JSON under one key and the player who started it under another (ONTOLOGY
// GameStore, D-49), and the game's viewer sockets (ONTOLOGY Viewers, D-31). The sockets use the
// hibernation API, so the object can leave memory while viewers stay connected.

import { DurableObject } from "cloudflare:workers";
import {
  currentFrame,
  FRAME_TOO_BIG_CLOSE,
  GAME_NOT_FOUND_CLOSE,
  liveViewId,
  VIEWER_MAX_FRAME_BYTES,
  type GameStore,
  type StoredGame,
} from "@starreach/app";

import { core } from "./core.ts";
import { DurableObjectPlayerStore } from "./player_store.ts";

const GAME_KEY = "game";
const PLAYER_KEY = "player";

export class GameObject extends DurableObject<Env> {
  /** This object's own game as a GameStore. The object is already the one its view_id names. */
  private readonly ownGame: GameStore = {
    get: async () => this.getGame(),
    put: async (_viewId: string, stored: StoredGame) => this.putGame(stored),
  };

  /** The game and the player who started it, or undefined when either is missing. */
  getGame(): StoredGame | undefined {
    const game = this.ctx.storage.kv.get<string>(GAME_KEY);
    const player = this.ctx.storage.kv.get<string>(PLAYER_KEY);
    return game === undefined || player === undefined ? undefined : { game, player };
  }

  putGame({ game, player }: StoredGame): void {
    this.ctx.storage.kv.put(GAME_KEY, game);
    this.ctx.storage.kv.put(PLAYER_KEY, player);
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
    if (!(await this.welcome(server, view))) {
      server.accept();
      server.close(GAME_NOT_FOUND_CLOSE, "Game not found");
    }
    return upgraded;
  }

  /** Takes a viewer's socket into this game's viewers and sends it the current frame; false for
   *  a game this object doesn't hold or the core can't read. The frame's achievements are read
   *  from the starting player's object, and nothing else reaches this object meanwhile: a
   *  command stored or published during that read would otherwise be missed by the new socket,
   *  or overtaken by this older frame. */
  private welcome(server: WebSocket, view: string): Promise<boolean> {
    const makers = { core, store: this.ownGame, players: new DurableObjectPlayerStore(this.env.PLAYERS) };
    return this.ctx.blockConcurrencyWhile(async () => {
      const frame = await currentFrame(makers, view);
      if (frame === undefined) {
        return false;
      }
      this.ctx.acceptWebSocket(server);
      server.send(frame);
      return true;
    });
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

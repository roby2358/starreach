// The viewers' sockets on Node: an in-process list per game (ONTOLOGY "Viewers").

import type { Viewers } from "@starreach/app";
import { WebSocket } from "ws";

export class SocketViewers implements Viewers {
  private readonly sockets = new Map<string, Set<WebSocket>>();

  /** Adds a socket to a game's list until it closes. */
  attach(gameId: string, socket: WebSocket): void {
    const watching = this.sockets.get(gameId) ?? new Set<WebSocket>();
    this.sockets.set(gameId, watching);
    watching.add(socket);
    socket.once("close", () => this.detach(gameId, socket));
  }

  async publish(gameId: string, frame: string): Promise<void> {
    for (const socket of this.sockets.get(gameId) ?? []) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(frame);
      }
    }
  }

  private detach(gameId: string, socket: WebSocket): void {
    const watching = this.sockets.get(gameId);
    watching?.delete(socket);
    if (watching?.size === 0) {
      this.sockets.delete(gameId);
    }
  }
}

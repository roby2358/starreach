// The viewers' sockets on Node: an in-process list per view_id (ONTOLOGY "Viewers").

import type { Viewers } from "@starreach/app";
import { WebSocket } from "ws";

export class SocketViewers implements Viewers {
  private readonly sockets = new Map<string, Set<WebSocket>>();

  /** Adds a socket to a view's list until it closes. */
  attach(view: string, socket: WebSocket): void {
    const watching = this.sockets.get(view) ?? new Set<WebSocket>();
    this.sockets.set(view, watching);
    watching.add(socket);
    socket.once("close", () => this.detach(view, socket));
  }

  async publish(view: string, frame: string): Promise<void> {
    for (const socket of this.sockets.get(view) ?? []) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(frame);
      }
    }
  }

  private detach(view: string, socket: WebSocket): void {
    const watching = this.sockets.get(view);
    watching?.delete(socket);
    if (watching?.size === 0) {
      this.sockets.delete(view);
    }
  }
}

// The Node HTTP server (ONTOLOGY "HTTP"): the page, the app layer's routes, and viewer sockets
// on one port.

import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";

import { serve } from "@hono/node-server";
import { currentFrame, GAME_NOT_FOUND_CLOSE, handleHttp, liveGameId, type McpDeps } from "@starreach/app";
import { WebSocket, WebSocketServer } from "ws";

import type { SocketViewers } from "./viewers.ts";

export interface NodeDeps extends McpDeps {
  viewers: SocketViewers;
}

/** A viewer has nothing to say, so any frame bigger than this closes its socket. */
const VIEWER_MAX_FRAME_BYTES = 1024;

const PUBLIC_DIR = new URL("../../../public/", import.meta.url);

/** The page's files, by the path that serves each one. */
const PAGE_FILES = [
  { path: "/", file: "index.html", type: "text/html; charset=utf-8" },
  { path: "/css/styles.css", file: "css/styles.css", type: "text/css; charset=utf-8" },
  { path: "/js/script.js", file: "js/script.js", type: "text/javascript; charset=utf-8" },
  { path: "/fonts/oxanium.woff2", file: "fonts/oxanium.woff2", type: "font/woff2" },
];

function loadPage(): Map<string, { body: Uint8Array<ArrayBuffer>; type: string }> {
  return new Map(
    PAGE_FILES.map(({ path, file, type }) => [path, { body: new Uint8Array(readFileSync(new URL(file, PUBLIC_DIR))), type }]),
  );
}

async function connectViewer(socket: WebSocket, gameId: string, deps: NodeDeps): Promise<void> {
  socket.on("error", (error) => console.error(`Viewer socket: ${error.message}`));
  const frame = await currentFrame(deps, gameId);
  if (frame === undefined) {
    socket.close(GAME_NOT_FOUND_CLOSE, "Game not found");
    return;
  }
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  deps.viewers.attach(gameId, socket);
  socket.send(frame);
}

function acceptViewers(server: Server, deps: NodeDeps): void {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: VIEWER_MAX_FRAME_BYTES });
  server.on("upgrade", (request, stream: Duplex, head) => {
    const gameId = liveGameId(new URL(request.url ?? "", "http://upgrade").pathname);
    if (gameId === undefined) {
      stream.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(request, stream, head, (socket) => void connectViewer(socket, gameId, deps));
  });
}

/** Serves everything on one port. Resolves once it is listening, and rejects if it can't bind. */
export function serveHttp(deps: NodeDeps, hostname: string, port: number): Promise<Server> {
  const page = loadPage();
  const fetch = (request: Request): Response | Promise<Response> => {
    const file = request.method === "GET" ? page.get(new URL(request.url).pathname) : undefined;
    return file === undefined ? handleHttp(request, deps) : new Response(file.body, { headers: { "content-type": file.type } });
  };
  return new Promise((resolve, reject) => {
    const server = serve({ fetch, hostname, port }, () => {
      server.off("error", reject);
      resolve(server as Server);
    }) as Server;
    server.once("error", reject);
    acceptViewers(server, deps);
  });
}

export function listeningPort(server: Server): number {
  return (server.address() as AddressInfo).port;
}

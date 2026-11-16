// The Node HTTP server (ONTOLOGY "HTTP"): the page, the app layer's routes, the telemetry the
// process holds (D-52), and viewer sockets on one port.

import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";

import { serve } from "@hono/node-server";
import {
  currentFrame,
  GAME_NOT_FOUND_CLOSE,
  handleHttp,
  liveViewId,
  VIEWER_MAX_FRAME_BYTES,
  type McpDeps,
  type MemoryTelemetry,
} from "@starreach/app";
import { WebSocket, WebSocketServer } from "ws";

import type { SocketViewers } from "./viewers.ts";

export interface NodeDeps extends McpDeps {
  viewers: SocketViewers;
  /** The sink is the in-memory one, so that `/telemetry` can give out what it holds. */
  telemetry: MemoryTelemetry;
}

const TELEMETRY_PATH = "/telemetry";

const PUBLIC_DIR = new URL("../../../public/", import.meta.url);

/** The page's files, by the path that serves each one. */
const PAGE_FILES = [
  { path: "/", file: "index.html", type: "text/html; charset=utf-8" },
  { path: "/viewer", file: "viewer.html", type: "text/html; charset=utf-8" },
  { path: "/css/styles.css", file: "css/styles.css", type: "text/css; charset=utf-8" },
  { path: "/css/home.css", file: "css/home.css", type: "text/css; charset=utf-8" },
  { path: "/js/script.js", file: "js/script.js", type: "text/javascript; charset=utf-8" },
  { path: "/images/viewer.jpg", file: "images/viewer.jpg", type: "image/jpeg" },
  { path: "/fonts/oxanium.woff2", file: "fonts/oxanium.woff2", type: "font/woff2" },
];

function loadPage(): Map<string, { body: Uint8Array<ArrayBuffer>; type: string }> {
  return new Map(
    PAGE_FILES.map(({ path, file, type }) => [path, { body: new Uint8Array(readFileSync(new URL(file, PUBLIC_DIR))), type }]),
  );
}

async function connectViewer(socket: WebSocket, view: string, deps: NodeDeps): Promise<void> {
  socket.on("error", (error) => console.error(`Viewer socket: ${error.message}`));
  const frame = await currentFrame(deps, view);
  if (frame === undefined) {
    socket.close(GAME_NOT_FOUND_CLOSE, "Game not found");
    return;
  }
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  deps.viewers.attach(view, socket);
  socket.send(frame);
}

/** The view_id an upgrade request's path watches, or undefined for a request with no URL or any
 *  other path. The URL is only a path, so a fixed base parses it. */
function upgradeViewId(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  return liveViewId(new URL(url, "http://upgrade").pathname);
}

function acceptViewers(server: Server, deps: NodeDeps): void {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: VIEWER_MAX_FRAME_BYTES });
  server.on("upgrade", (request, stream: Duplex, head) => {
    const view = upgradeViewId(request.url);
    if (view === undefined) {
      stream.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(request, stream, head, (socket) => void connectViewer(socket, view, deps));
  });
}

/** Everything the sink holds, a JSON object per line: each game record as `{"game": …}` in the
 *  order the games started, then each event record as `{"event": …}` in the order received. */
export function telemetryLines(telemetry: MemoryTelemetry): string {
  const lines = [
    ...telemetry.games().map((game) => JSON.stringify({ game })),
    ...telemetry.events().map((event) => JSON.stringify({ event })),
  ];
  return lines.map((line) => `${line}\n`).join("");
}

/** Serves everything on one port. Resolves once it is listening, and rejects if it can't bind. */
export function serveHttp(deps: NodeDeps, hostname: string, port: number): Promise<Server> {
  const page = loadPage();
  const fetch = (request: Request): Response | Promise<Response> => {
    if (request.method !== "GET") {
      return handleHttp(request, deps);
    }
    const path = new URL(request.url).pathname;
    if (path === TELEMETRY_PATH) {
      return new Response(telemetryLines(deps.telemetry), { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
    }
    const file = page.get(path);
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

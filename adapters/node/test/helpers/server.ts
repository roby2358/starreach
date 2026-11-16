// Shared setup for adapter tests: the real server on a free port, and a viewer socket whose
// frames can be awaited in order.

import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import { fileURLToPath } from "node:url";

import { loadCore, MemoryPlayerStore, MemoryStore, MemoryTelemetry, type McpClient } from "@starreach/app";
import { WebSocket } from "ws";

import { listeningPort, serveHttp, type NodeDeps } from "../../src/server.ts";
import { SocketViewers } from "../../src/viewers.ts";

const core = loadCore(new WebAssembly.Module(readFileSync(fileURLToPath(import.meta.resolve("@starreach/app/wasm")))));

/** The real time every test game starts at: midnight on Unix day 20773, stardate 102.0773.00.0. */
export const START_UNIX_SECONDS = 20_773 * 86_400;

/** The MCP client of a game a test starts without going through MCP. */
export const TEST_CLIENT: McpClient = { name: "test", version: "0", user_agent: null };

export interface Running {
  deps: NodeDeps & { telemetry: MemoryTelemetry };
  server: Server;
  connections: Set<Socket>;
  port: number;
  base: string;
}

export async function startServer(): Promise<Running> {
  const deps = {
    core,
    store: new MemoryStore(),
    players: new MemoryPlayerStore(),
    telemetry: new MemoryTelemetry(),
    random: Math.random,
    viewers: new SocketViewers(),
    viewOrigin: "http://viewer.test",
    unixSeconds: () => START_UNIX_SECONDS,
    instructions: "Test instructions",
    player: null,
  };
  const server = await serveHttp(deps, "127.0.0.1", 0);
  const connections = new Set<Socket>();
  server.on("connection", (connection) => connections.add(connection));
  const port = listeningPort(server);
  return { deps, server, connections, port, base: `http://127.0.0.1:${port}` };
}

/** Drops every connection, upgraded sockets included, which `closeAllConnections` leaves open. */
export function stopServer({ server, connections }: Running): Promise<void> {
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  connections.forEach((connection) => connection.destroy());
  return closed;
}

/** A viewer socket. `nextFrame` returns frames in arrival order and `closed` the close code. */
export class Viewer {
  private readonly frames: Record<string, any>[] = [];
  private readonly waiting: ((frame: Record<string, any>) => void)[] = [];
  readonly socket: WebSocket;
  readonly closed: Promise<number>;

  constructor(port: number, gameId: string) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/live/${gameId}`);
    this.socket.on("message", (data) => this.receive(JSON.parse(data.toString())));
    this.closed = new Promise((resolve) => this.socket.once("close", (code) => resolve(code)));
  }

  nextFrame(): Promise<Record<string, any>> {
    const ready = this.frames.shift();
    return ready === undefined ? new Promise((resolve) => this.waiting.push(resolve)) : Promise.resolve(ready);
  }

  framesReceived(): number {
    return this.frames.length;
  }

  private receive(frame: Record<string, any>): void {
    const waiter = this.waiting.shift();
    if (waiter === undefined) {
      this.frames.push(frame);
      return;
    }
    waiter(frame);
  }
}

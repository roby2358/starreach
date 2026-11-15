// Shared setup for the adapter's tests: MCP calls to the Worker as a signed-in player, and a
// viewer socket whose frames can be awaited in order.

import { exports } from "cloudflare:workers";
import { expect } from "vitest";

import { claimsAt, mint, nowSeconds } from "./tokens.ts";

// Loads the Worker before the tests start. The first load takes workerd several seconds,
// which would otherwise count against the first test's timeout.
import "../../src/worker.ts";

export const BASE = "http://starreach.test";

async function rpc(method: string, params: Record<string, unknown>): Promise<Request> {
  const token = await mint(claimsAt(nowSeconds()));
  return new Request(`${BASE}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

export async function rpcResult(method: string, params: Record<string, unknown>): Promise<any> {
  const response = await exports.default.fetch(await rpc(method, params));
  expect(response.status).toBe(200);
  const body: any = await response.json();
  return body.result;
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
  const result = await rpcResult("tools/call", { name, arguments: args });
  return JSON.parse(result.content[0].text);
}

/** A new game's game_id and the view_id its link carries. */
export async function createGame(): Promise<{ gameId: string; view: string }> {
  const created = await callTool("new_game", {});
  return { gameId: created.report.game_id, view: new URL(created.report.viewer_url).searchParams.get("view")! };
}

/** The Worker's answer to a socket upgrade on `/live/<id>`. */
export function upgrade(id: string): Promise<Response> {
  return exports.default.fetch(new Request(`${BASE}/live/${id}`, { headers: { upgrade: "websocket" } }));
}

/** A viewer socket. `nextFrame` returns frames in arrival order and `closed` the close code. */
export class Viewer {
  private readonly frames: Record<string, any>[] = [];
  private readonly waiting: ((frame: Record<string, any>) => void)[] = [];
  readonly socket: WebSocket;
  readonly closed: Promise<number>;

  constructor(socket: WebSocket) {
    this.socket = socket;
    this.closed = new Promise((resolve) => socket.addEventListener("close", (event) => resolve(event.code)));
    socket.addEventListener("message", (event) => this.receive(JSON.parse(event.data as string)));
    socket.accept();
  }

  nextFrame(): Promise<Record<string, any>> {
    const ready = this.frames.shift();
    return ready === undefined ? new Promise((resolve) => this.waiting.push(resolve)) : Promise.resolve(ready);
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

export async function connectViewer(view: string): Promise<Viewer> {
  const response = await upgrade(view);
  expect(response.status).toBe(101);
  return new Viewer(response.webSocket!);
}

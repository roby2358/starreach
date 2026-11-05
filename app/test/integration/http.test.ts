// The HTTP routes: /health, MCP at /mcp, 404 elsewhere. A game made over one request is
// there on the next, because MCP runs stateless over a shared store.

import assert from "node:assert/strict";
import { test } from "node:test";

import { handleHttp, type McpDeps } from "../../src/index.ts";
import { testDeps } from "../helpers/deps.ts";

const BASE = "http://localhost";

function rpc(method: string, params: Record<string, unknown>): Request {
  return new Request(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function callTool(deps: McpDeps, name: string, args: Record<string, unknown>) {
  const response = await handleHttp(rpc("tools/call", { name, arguments: args }), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  return JSON.parse(body.result.content[0].text);
}

test("GET /health answers ok", async () => {
  const response = await handleHttp(new Request(`${BASE}/health`), testDeps());
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("other paths are not found", async () => {
  const response = await handleHttp(new Request(`${BASE}/state`), testDeps());
  assert.equal(response.status, 404);
});

test("a game made over HTTP is playable on later requests", async () => {
  const deps = testDeps();
  const created = await callTool(deps, "new_game", {});
  const gameId = created.report.game_id;
  const state = await callTool(deps, "state", { game_id: gameId });
  assert.equal(state.ok, true);
  assert.deepEqual(state.state, created.state);
});

test("tools/list names new_game and every command", async () => {
  const response = await handleHttp(rpc("tools/list", {}), testDeps());
  const names = (await response.json()).result.tools.map((t: { name: string }) => t.name).sort();
  assert.deepEqual(names, ["blast", "dock", "galaxy_map", "galaxy_warp", "long_range_scan", "new_game", "state", "subwarp", "torpedo"]);
});

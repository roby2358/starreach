// The Worker's HTTP routes: /health, MCP at /mcp, 404 elsewhere. A game made over one request
// is there on the next, because it is stored in its Durable Object.

import { exports } from "cloudflare:workers";
import { expect, test } from "vitest";

import { BASE, callTool, rpcResult } from "../helpers/worker.ts";

test("GET /health answers ok", async () => {
  const response = await exports.default.fetch(`${BASE}/health`);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("other paths are not found", async () => {
  const response = await exports.default.fetch(`${BASE}/state`);
  expect(response.status).toBe(404);
  await response.text();
});

test("a game made over HTTP is playable on later requests", async () => {
  const created = await callTool("new_game", {});
  const gameId = created.report.game_id;
  const state = await callTool("state", { game_id: gameId });
  expect(state.ok).toBe(true);
  expect(state.state).toEqual(created.state);
});

test("an accepted command is stored, with no viewers watching", async () => {
  const created = await callTool("new_game", {});
  const gameId = created.report.game_id;
  const scanned = await callTool("long_range_scan", { game_id: gameId });
  expect(scanned.ok).toBe(true);
  const state = await callTool("state", { game_id: gameId });
  expect(state.state).toEqual(scanned.state);
  expect(state.state).not.toEqual(created.state);
});

test("an unknown game_id is not found", async () => {
  const state = await callTool("state", { game_id: "no-such-game" });
  expect(state).toMatchObject({ ok: false, error: "Game not found", state: null });
});

test("the viewer's link uses the request's origin", async () => {
  const created = await callTool("new_game", {});
  expect(created.report.view_url).toMatch(/^http:\/\/starreach\.test\/\?view=[0-9a-f]{64}$/);
});

test("tools/list names new_game and every command", async () => {
  const result = await rpcResult("tools/list", {});
  const names = result.tools.map((tool: { name: string }) => tool.name).sort();
  expect(names).toEqual(["blast", "dock", "galaxy_map", "galaxy_warp", "long_range_scan", "new_game", "state", "subwarp", "torpedo"]);
});

test("the instructions prompt carries the text the page's folder holds", async () => {
  const result = await rpcResult("prompts/get", { name: "instructions" });
  expect(result.messages[0].content.text.length).toBeGreaterThan(0);
});

// R-51 (Node adapter): GET /telemetry gives out everything the local server's in-memory sink
// holds, a JSON object per line: the game records, then the event records.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { startServer, stopServer, type Running } from "../helpers/server.ts";

let running: Running;

beforeEach(async () => {
  running = await startServer();
});

afterEach(() => stopServer(running));

async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${running.base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body: any = await response.json();
  return JSON.parse(body.result.content[0].text);
}

async function telemetryLines(): Promise<any[]> {
  const response = await fetch(`${running.base}/telemetry`);
  assert.equal(response.status, 200);
  const text = await response.text();
  return text.split("\n").slice(0, -1).map((line) => JSON.parse(line));
}

test("a game played over /mcp comes out as its game record and one event per tool call", async () => {
  const gameId = (await callTool("new_game", {})).report.game_id;
  await callTool("long_range_scan", { game_id: gameId });
  await callTool("state", { game_id: gameId });
  await callTool("subwarp", { game_id: gameId, x: 99, y: 99 });

  const lines = await telemetryLines();
  const calls = lines.slice(1).map((line) => [line.event.tool, line.event.accepted]);

  const [game] = running.deps.telemetry.games();
  assert.deepEqual(lines, [{ game }, ...running.deps.telemetry.eventsOf(game.game_key).map((event) => ({ event }))]);
  assert.deepEqual(calls, [["long_range_scan", true], ["state", true], ["subwarp", false]]);
});

test("the records of every game are given, the games first", async () => {
  const first = (await callTool("new_game", {})).report.game_id;
  await callTool("state", { game_id: first });
  const second = (await callTool("new_game", {})).report.game_id;
  await callTool("state", { game_id: second });

  const lines = await telemetryLines();

  const [firstKey, secondKey] = running.deps.telemetry.games().map((game) => game.game_key);
  assert.notEqual(firstKey, secondKey);
  assert.deepEqual(lines.map((line) => Object.keys(line)), [["game"], ["game"], ["event"], ["event"]]);
  assert.deepEqual(lines.map((line) => (line.game ?? line.event).game_key), [firstKey, secondKey, firstKey, secondKey]);
});

test("a server that has recorded nothing answers 200 with no lines", async () => {
  const response = await fetch(`${running.base}/telemetry`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /application\/x-ndjson/);
  assert.equal(await response.text(), "");
});

test("only GET reads it: another method gets the 404 of any other path", async () => {
  const response = await fetch(`${running.base}/telemetry`, { method: "POST" });

  assert.equal(response.status, 404);
});

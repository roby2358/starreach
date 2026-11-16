// R-45 (Node adapter): the local server keeps telemetry in its in-memory sink. A game started
// over its HTTP MCP endpoint leaves a game record whose client is the request's User-Agent.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startServer, stopServer, type Running } from "../helpers/server.ts";

let running: Running;

before(async () => {
  running = await startServer();
});

after(() => stopServer(running));

test("new_game over the server's /mcp leaves a game record with the caller's User-Agent", async () => {
  const response = await fetch(`${running.base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "example-client/1.0" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "new_game", arguments: {} } }),
  });

  assert.equal(response.status, 200);
  const [record] = running.deps.telemetry.games();
  assert.equal(running.deps.telemetry.games().length, 1);
  assert.deepEqual(record.client, { name: null, version: null, user_agent: "example-client/1.0" });
});

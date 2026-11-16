// R-45 (app layer): the game record's MCP client is what the server can tell on the call: the
// name and version declared in `initialize` where the connection carried one, and the
// User-Agent where the call came over HTTP.

import assert from "node:assert/strict";
import { test } from "node:test";

import { handleHttp } from "../../src/index.ts";
import { call, connectClient, testDeps } from "../helpers/deps.ts";
import { onlyGame } from "../helpers/telemetry.ts";

function newGameRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "new_game", arguments: {} } }),
  });
}

test("on a connection that began with initialize, the client is its declared name and version", async () => {
  const deps = testDeps();
  const client = await connectClient(deps);

  await call(client, "new_game", {});

  assert.deepEqual(onlyGame(deps.telemetry).client, { name: "test", version: "0", user_agent: null });
});

test("over stateless HTTP the client is the request's User-Agent, with no declared name", async () => {
  const deps = testDeps();

  await handleHttp(newGameRequest({ "user-agent": "example-client/1.0" }), deps);

  assert.deepEqual(onlyGame(deps.telemetry).client, { name: null, version: null, user_agent: "example-client/1.0" });
});

test("a call with no User-Agent and no declared name records a client with nothing known", async () => {
  const deps = testDeps();

  await handleHttp(newGameRequest({}), deps);

  assert.deepEqual(onlyGame(deps.telemetry).client, { name: null, version: null, user_agent: null });
});

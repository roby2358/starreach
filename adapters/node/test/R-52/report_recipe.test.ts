// R-52 (Node adapter): `just telemetry-report local` runs
// `node tools/telemetry_report.ts <host> <port> <wrangler config> local`: it prints the report
// for the games played on the local server, and says what to do when no server is there.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { playFromDump } from "../../../../tools/telemetry_report/records.ts";
import { report } from "../../../../tools/telemetry_report/render.ts";

import { startServer, stopServer, type Running } from "../helpers/server.ts";

const TOOL = fileURLToPath(new URL("../../../../tools/telemetry_report.ts", import.meta.url));
const WRANGLER_CONFIG = fileURLToPath(new URL("../../../cloudflare/wrangler.jsonc", import.meta.url));

interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the tool as the recipe does, with the recipe's own arguments after the fixed three. */
function runReport(port: number, args: string[]): Promise<Ran> {
  return new Promise((resolve) => {
    execFile("node", [TOOL, "127.0.0.1", String(port), WRANGLER_CONFIG, ...args], (error, stdout, stderr) => {
      resolve({ code: error === null ? 0 : (error.code as number), stdout, stderr });
    });
  });
}

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address() as { port: number };
  probe.close();
  await once(probe, "close");
  return port;
}

async function callTool(running: Running, name: string, args: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${running.base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "report-test/1" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body: any = await response.json();
  return JSON.parse(body.result.content[0].text);
}

test("it prints the report for a game played on the local server over /mcp", async () => {
  const running = await startServer();
  try {
    const gameId = (await callTool(running, "new_game", {})).report.game_id;
    await callTool(running, "galaxy_map", { game_id: gameId });
    await callTool(running, "long_range_scan", { game_id: gameId });
    await callTool(running, "subwarp", { game_id: gameId, x: 99, y: 99 });

    const ran = await runReport(running.port, ["local"]);

    assert.equal(ran.code, 0, ran.stderr);
    const dump = await (await fetch(`${running.base}/telemetry`)).text();
    const heading = { source: `the local server's memory (${running.base}/telemetry)`, period: "all time", since: 0 };
    assert.equal(ran.stdout, report(playFromDump(dump), heading));
    assert.match(ran.stdout, /1 game, 3 tool calls; rules version: 1/);
    assert.match(ran.stdout, /\n  long_range_scan +1 +1 +0\n/);
    assert.match(ran.stdout, /\n  never used: state, galaxy_warp, dock, blast, torpedo\n/);
    assert.match(ran.stdout, /\n  Coordinates \(N, N\) are outside N\.\.N +1\n/);
    assert.match(ran.stdout, /\n  report-test\/1 +1\n/);
  } finally {
    await stopServer(running);
  }
});

test("a number of days, before or after the source, sets the report's period", async () => {
  const running = await startServer();
  try {
    const gameId = (await callTool(running, "new_game", {})).report.game_id;
    await callTool(running, "state", { game_id: gameId });

    const ran = await runReport(running.port, ["1", "local"]);

    assert.equal(ran.code, 0, ran.stderr);
    assert.match(ran.stdout, /period: games started in the last 1 day\n/);
  } finally {
    await stopServer(running);
  }
});

test("with no server on the port it fails and says to start one", async () => {
  const ran = await runReport(await freePort(), ["local"]);

  assert.equal(ran.code, 1);
  assert.equal(ran.stdout, "");
  assert.match(ran.stderr, /no local server is running at http:\/\/127\.0\.0\.1:\d+; start one with: just up/);
});

test("arguments that are neither a source nor a number of days get the usage and nothing is read", async () => {
  const ran = await runReport(await freePort(), ["local", "soon"]);

  assert.equal(ran.code, 1);
  assert.equal(ran.stdout, "");
  assert.match(ran.stderr, /^usage: just telemetry-report \[local\|local-d1\|production\] \[days\]/);
});

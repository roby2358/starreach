// Stdio mode: MCP on stdio and the viewer on HTTP in one process, so both see one game. The
// process ends when the MCP client hangs up, freeing the port for its next launch.

import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { Viewer } from "../helpers/server.ts";

const MAIN = fileURLToPath(new URL("../../src/main.ts", import.meta.url));

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address() as { port: number };
  probe.close();
  await once(probe, "close");
  return port;
}

function launch(port: number): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [MAIN, "stdio", "--host", "127.0.0.1", "--port", String(port), "--origin", "http://localhost"]);
}

async function waitForLog(child: ChildProcessWithoutNullStreams, text: string): Promise<void> {
  for await (const line of createInterface({ input: child.stderr })) {
    if (line.includes(text)) {
      return;
    }
  }
  throw new Error(`the server ended before logging ${text}`);
}

function toolCall(id: number, name: string, args: Record<string, unknown>): string {
  return `${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })}\n`;
}

test("a viewer watches the game the stdio client is playing, and hanging up ends the process", async () => {
  const port = await freePort();
  const child = launch(port);
  const replies = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  await waitForLog(child, "on stdio");

  child.stdin.write(toolCall(1, "new_game", {}));
  const reply = await replies.next();
  const created = JSON.parse(JSON.parse(reply.value as string).result.content[0].text);
  const gameId = created.report.game_id;
  assert.equal(created.report.view_url, `http://localhost/?game=${gameId}`);

  const viewer = new Viewer(port, gameId);
  const first = await viewer.nextFrame();
  child.stdin.write(toolCall(2, "long_range_scan", { game_id: gameId }));
  const scanned = await viewer.nextFrame();
  assert.ok(scanned.view.ship.energy < first.view.ship.energy);
  viewer.socket.close();

  const exited = once(child, "exit");
  child.stdin.end();
  assert.deepEqual(await exited, [0, null]);
});

test("a second stdio client on the port shares the first one's games, and hanging up leaves the first running", async () => {
  const port = await freePort();
  const first = launch(port);
  const firstReplies = createInterface({ input: first.stdout })[Symbol.asyncIterator]();
  await waitForLog(first, "on stdio");

  const second = launch(port);
  const secondReplies = createInterface({ input: second.stdout })[Symbol.asyncIterator]();
  await waitForLog(second, "forwarding to the server");

  second.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  second.stdin.write(toolCall(1, "new_game", {}));
  const created = JSON.parse(JSON.parse((await secondReplies.next()).value as string).result.content[0].text);
  assert.equal(created.ok, true);

  const secondExited = once(second, "exit");
  second.stdin.end();
  assert.deepEqual(await secondExited, [0, null]);

  first.stdin.write(toolCall(2, "state", { game_id: created.report.game_id }));
  const state = JSON.parse(JSON.parse((await firstReplies.next()).value as string).result.content[0].text);
  assert.equal(state.ok, true);

  const firstExited = once(first, "exit");
  first.stdin.end();
  await firstExited;
});

test("stdio mode refuses a port held by something that isn't Starreach", async () => {
  const port = await freePort();
  const other = createServer((socket) => socket.end()).listen(port, "127.0.0.1");
  await once(other, "listening");
  const child = launch(port);
  const [code] = await once(child, "exit");
  other.close();
  assert.notEqual(code, 0);
});

test("stdio mode refuses to start without its HTTP flags", async () => {
  const child = spawn(process.execPath, [MAIN, "stdio"]);
  const [code] = await once(child, "exit");
  assert.notEqual(code, 0);
});

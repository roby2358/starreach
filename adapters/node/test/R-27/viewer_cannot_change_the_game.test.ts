// R-27: a viewer's socket is read-only. Whatever it sends, the game doesn't change.

import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";

import { FRAME_TOO_BIG_CLOSE, newGame, VIEWER_MAX_FRAME_BYTES, viewId } from "@starreach/app";

import { startServer, stopServer, Viewer, type Running } from "../helpers/server.ts";

let running: Running;
before(async () => {
  running = await startServer();
});
after(() => stopServer(running));

test("a command sent down the socket does nothing", async () => {
  const gameId = (await newGame(running.deps)).report!.game_id as string;
  const before = await running.deps.store.get(await viewId(gameId));
  const viewer = new Viewer(running.port, await viewId(gameId));
  await viewer.nextFrame();

  viewer.socket.send(JSON.stringify({ type: "long_range_scan" }));
  viewer.socket.send(JSON.stringify({ type: "galaxy_warp", game_id: gameId, x: 0, y: 0 }));
  // A socket keeps its order, so the pong means the server has read everything above.
  viewer.socket.ping();
  await once(viewer.socket, "pong");

  assert.deepEqual(await running.deps.store.get(await viewId(gameId)), before);
  viewer.socket.close();
});

test("a frame at the size limit is dropped and the socket stays open", async () => {
  const gameId = (await newGame(running.deps)).report!.game_id as string;
  const viewer = new Viewer(running.port, await viewId(gameId));
  await viewer.nextFrame();

  viewer.socket.send("x".repeat(VIEWER_MAX_FRAME_BYTES));
  // A socket keeps its order, so the pong means the server has read the frame above.
  viewer.socket.ping();
  await once(viewer.socket, "pong");

  assert.equal(viewer.socket.readyState, viewer.socket.OPEN);
  viewer.socket.close();
});

test("a frame over the size limit closes that socket and leaves the game alone", async () => {
  const gameId = (await newGame(running.deps)).report!.game_id as string;
  const before = await running.deps.store.get(await viewId(gameId));
  const viewer = new Viewer(running.port, await viewId(gameId));
  await viewer.nextFrame();

  viewer.socket.send("x".repeat(VIEWER_MAX_FRAME_BYTES + 1));

  assert.equal(await viewer.closed, FRAME_TOO_BIG_CLOSE);
  assert.deepEqual(await running.deps.store.get(await viewId(gameId)), before);
});

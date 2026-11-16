// R-27: a viewer's socket is read-only. Whatever it sends, the game doesn't change.

import { FRAME_TOO_BIG_CLOSE, VIEWER_MAX_FRAME_BYTES } from "@starreach/app";
import { expect, test } from "vitest";

import { callTool, connectViewer, createGame } from "../helpers/worker.ts";

test("a command sent down the socket does nothing", async () => {
  const { gameId, view } = await createGame();
  const before = await callTool("state", { game_id: gameId });
  const viewer = await connectViewer(view);
  const first = await viewer.nextFrame();

  viewer.socket.send(JSON.stringify({ type: "long_range_scan" }));
  viewer.socket.send(JSON.stringify({ type: "galaxy_warp", game_id: gameId, x: 0, y: 0 }));
  // The state query publishes a frame, so the object has had its turn at the frames above.
  const after = await callTool("state", { game_id: gameId });
  const second = await viewer.nextFrame();

  expect(after.state).toEqual(before.state);
  expect(second).toEqual(first);
  viewer.socket.close();
});

test("a frame at the size limit is dropped and the socket stays open", async () => {
  const { gameId, view } = await createGame();
  const viewer = await connectViewer(view);
  const first = await viewer.nextFrame();

  viewer.socket.send("x".repeat(VIEWER_MAX_FRAME_BYTES));
  // The state query publishes a frame, which arrives only if the socket is still open.
  await callTool("state", { game_id: gameId });

  expect(await viewer.nextFrame()).toEqual(first);
  viewer.socket.close();
});

test("a frame over the size limit closes that socket and leaves the game alone", async () => {
  const { gameId, view } = await createGame();
  const before = await callTool("state", { game_id: gameId });
  const viewer = await connectViewer(view);
  await viewer.nextFrame();

  viewer.socket.send("x".repeat(VIEWER_MAX_FRAME_BYTES + 1));

  expect(await viewer.closed).toBe(FRAME_TOO_BIG_CLOSE);
  const after = await callTool("state", { game_id: gameId });
  expect(after.state).toEqual(before.state);
});

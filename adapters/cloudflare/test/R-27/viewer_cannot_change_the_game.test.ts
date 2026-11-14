// R-27: a viewer's socket is read-only. Whatever it sends, the game doesn't change.

import { env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";

import { callTool, connectViewer, createGame } from "../helpers/worker.ts";

test("a command sent down the socket does nothing", async () => {
  const { gameId, view } = await createGame();
  const before = await callTool("state", { game_id: gameId });
  const viewer = await connectViewer(view);
  const first = await viewer.nextFrame();

  viewer.socket.send(JSON.stringify({ type: "long_range_scan" }));
  viewer.socket.send(JSON.stringify({ type: "galaxy_warp", game_id: gameId, y: 0, x: 0 }));
  viewer.socket.send("x".repeat(2048));
  // The state query publishes a frame, so the object has had its turn at the frames above.
  const after = await callTool("state", { game_id: gameId });
  const second = await viewer.nextFrame();

  expect(after.state).toEqual(before.state);
  expect(second).toEqual(first);
  viewer.socket.close();
});

test("the object's message handler takes no part in the game", async () => {
  const { gameId, view } = await createGame();
  const before = await callTool("state", { game_id: gameId });
  await runInDurableObject(env.GAMES.getByName(view), (object) => object.webSocketMessage());
  const after = await callTool("state", { game_id: gameId });
  expect(after.state).toEqual(before.state);
});

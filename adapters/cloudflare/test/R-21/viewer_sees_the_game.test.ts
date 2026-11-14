// R-21: a viewer gets the game's view on connecting and again after every accepted command.
// The sockets are the Durable Object's, reached through the Worker's /live/<view_id> upgrade.

import { GAME_NOT_FOUND_CLOSE } from "@starreach/app";
import { expect, test } from "vitest";

import { callTool, connectViewer, createGame, upgrade } from "../helpers/worker.ts";

test("a viewer gets the current view on connecting", async () => {
  const { gameId, view } = await createGame();
  const viewer = await connectViewer(view);
  const frame = await viewer.nextFrame();
  const state = await callTool("state", { game_id: gameId });
  expect(frame.type).toBe("view");
  expect(frame.view.board).toEqual(state.state.map);
  expect(frame.view.ship.energy).toBe(state.state.ship_energy);
  viewer.socket.close();
});

test("every viewer of a game sees a command as it happens", async () => {
  const { gameId, view } = await createGame();
  const viewers = [await connectViewer(view), await connectViewer(view)];
  const [first] = await Promise.all(viewers.map((v) => v.nextFrame()));

  const scan = await callTool("long_range_scan", { game_id: gameId });

  for (const viewer of viewers) {
    const frame = await viewer.nextFrame();
    expect(frame.view.ship.energy).toBe(scan.state.ship_energy);
    expect(frame.view.ship.energy).not.toBe(first.view.ship.energy);
    viewer.socket.close();
  }
});

test("a viewer sees only its own game", async () => {
  const watched = await createGame();
  const other = await createGame();
  const viewer = await connectViewer(watched.view);
  await viewer.nextFrame();

  await callTool("long_range_scan", { game_id: other.gameId });
  await callTool("state", { game_id: watched.gameId });

  const frame = await viewer.nextFrame();
  expect(frame.view.ship.energy).toBe(frame.view.ship.max_energy);
  viewer.socket.close();
});

test("an unknown game closes the socket with the not-found code", async () => {
  const response = await upgrade("0".repeat(64));
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  const closed = new Promise<number>((resolve) => socket.addEventListener("close", (event) => resolve(event.code)));
  socket.accept();
  expect(await closed).toBe(GAME_NOT_FOUND_CLOSE);
});

test("any other socket path is refused", async () => {
  const response = await upgrade("not-a-game-id");
  expect(response.status).toBe(404);
  await response.text();
});

test("the socket path takes a view_id, never the game_id", async () => {
  const { gameId } = await createGame();
  const response = await upgrade(gameId);
  expect(response.status).toBe(404);
  await response.text();
});

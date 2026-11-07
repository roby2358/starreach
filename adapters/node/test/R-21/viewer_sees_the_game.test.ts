// R-21: a viewer gets the game's view on connecting and again after every accepted command.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { newGame, runCommand } from "@starreach/app";

import { startServer, stopServer, Viewer, type Running } from "../helpers/server.ts";

let running: Running;
before(async () => {
  running = await startServer();
});
after(() => stopServer(running));

async function createGame(): Promise<string> {
  return (await newGame(running.deps)).report!.game_id as string;
}

test("a viewer gets the current view on connecting", async () => {
  const gameId = await createGame();
  const viewer = new Viewer(running.port, gameId);
  const frame = await viewer.nextFrame();
  assert.equal(frame.type, "view");
  assert.deepEqual(frame.view, running.deps.core.view((await running.deps.store.get(gameId))!));
  viewer.socket.close();
});

test("every viewer of a game sees a command as it happens", async () => {
  const gameId = await createGame();
  const viewers = [new Viewer(running.port, gameId), new Viewer(running.port, gameId)];
  const [first] = await Promise.all(viewers.map((v) => v.nextFrame()));

  const scan = await runCommand(running.deps, gameId, { type: "long_range_scan" });

  for (const viewer of viewers) {
    const frame = await viewer.nextFrame();
    assert.equal(frame.view.ship.energy, scan.state!.ship_energy);
    assert.notEqual(frame.view.ship.energy, first.view.ship.energy);
    viewer.socket.close();
  }
});

test("a viewer sees only its own game", async () => {
  const watched = await createGame();
  const other = await createGame();
  const viewer = new Viewer(running.port, watched);
  await viewer.nextFrame();

  await runCommand(running.deps, other, { type: "long_range_scan" });
  await runCommand(running.deps, watched, { type: "state" });

  const frame = await viewer.nextFrame();
  assert.equal(frame.view.ship.energy, frame.view.ship.max_energy);
  viewer.socket.close();
});

test("an unknown game closes the socket with the not-found code", async () => {
  const viewer = new Viewer(running.port, "00000000-0000-4000-8000-000000000000");
  assert.equal(await viewer.closed, 4404);
});

test("any other socket path is refused", async () => {
  const response = await new Promise<number>((resolve) => {
    const viewer = new Viewer(running.port, "not-a-game-id");
    viewer.socket.once("unexpected-response", (_request, incoming) => resolve(incoming.statusCode!));
    viewer.socket.once("error", () => {});
  });
  assert.equal(response, 404);
});

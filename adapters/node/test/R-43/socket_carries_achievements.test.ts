// R-43 (Node): the frames on a real viewer socket carry the local player's achievements, on
// connecting and after a command.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { achievements, LOCAL_PLAYER, newGame, runCommand, viewId, type Achievement } from "@starreach/app";

import { startServer, stopServer, Viewer, type Running, TEST_CLIENT } from "../helpers/server.ts";

let running: Running;
before(async () => {
  running = await startServer();
});
after(() => stopServer(running));

function row(frame: Record<string, any>, key: string): Achievement {
  return frame.achievements.find((achievement: Achievement) => achievement.key === key);
}

test("a viewer gets the local player's achievements on connecting and again after a command", async () => {
  const { deps } = running;
  await deps.players.add(LOCAL_PLAYER, { docks: 5 });
  const gameId = (await newGame(deps, TEST_CLIENT)).report!.game_id as string;
  const viewer = new Viewer(running.port, await viewId(gameId));

  const first = await viewer.nextFrame();
  assert.deepEqual(first.achievements, await achievements(deps, LOCAL_PLAYER));
  const scansBefore = row(first, "scans").total;

  await runCommand(deps, gameId, { type: "long_range_scan" });

  const second = await viewer.nextFrame();
  assert.deepEqual(second.achievements, await achievements(deps, LOCAL_PLAYER));
  assert.equal(row(second, "scans").total, scansBefore + 1);
  assert.deepEqual(row(second, "docks"), { key: "docks", label: "docks at a starbase", total: 5, reached: 5, next: 10 });
  viewer.socket.close();
});

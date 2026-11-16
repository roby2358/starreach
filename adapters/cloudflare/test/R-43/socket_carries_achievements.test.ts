// R-43 (Cloudflare): the game object remembers the signed-in player who started the game, and the
// frames on its viewer sockets carry that player's achievements, read from the player's object:
// on connecting, when no command is in hand, and after a command.

import { achievements } from "@starreach/app";
import { env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";

import { core } from "../../src/core.ts";
import { DurableObjectPlayerStore } from "../../src/player_store.ts";
import { PLAYER } from "../helpers/tokens.ts";
import { callTool, connectViewer, createGame } from "../helpers/worker.ts";

function playersAchievements() {
  return achievements({ core, players: new DurableObjectPlayerStore(env.PLAYERS) }, PLAYER);
}

function scans(frame: Record<string, any>): number {
  return frame.achievements.find((row: { key: string }) => row.key === "scans").total;
}

test("new_game stores the signed-in player beside the game, in the game's object", async () => {
  const { view } = await createGame();
  const player = await runInDurableObject(env.GAMES.getByName(view), (_object, state) => state.storage.kv.get("player"));
  expect(player).toBe(PLAYER);
});

test("a viewer gets the starting player's achievements on connecting", async () => {
  await new DurableObjectPlayerStore(env.PLAYERS).add(PLAYER, { docks: 5 });
  const { view } = await createGame();

  const viewer = await connectViewer(view);
  const frame = await viewer.nextFrame();

  expect(frame.achievements).toEqual(await playersAchievements());
  expect(frame.achievements.find((row: { key: string }) => row.key === "docks").total).toBeGreaterThanOrEqual(5);
  viewer.socket.close();
});

test("the frame after a command carries them with what that command counted", async () => {
  const { gameId, view } = await createGame();
  const viewer = await connectViewer(view);
  const first = await viewer.nextFrame();

  await callTool("long_range_scan", { game_id: gameId });

  const second = await viewer.nextFrame();
  expect(scans(second)).toBe(scans(first) + 1);
  expect(second.achievements).toEqual(await playersAchievements());
  viewer.socket.close();
});

test("no frame names the player", async () => {
  const { gameId, view } = await createGame();
  const viewer = await connectViewer(view);
  const first = await viewer.nextFrame();
  await callTool("long_range_scan", { game_id: gameId });
  const second = await viewer.nextFrame();

  for (const frame of [first, second]) {
    expect(Object.keys(frame).sort()).toEqual(["achievements", "type", "view"]);
    expect(JSON.stringify(frame)).not.toContain(PLAYER);
  }
  viewer.socket.close();
});

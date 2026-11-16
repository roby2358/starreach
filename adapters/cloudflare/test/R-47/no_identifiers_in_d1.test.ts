// R-47 (Cloudflare): no column of the D1 telemetry tables holds the game_id, the view_id or the
// player id of a game played through the Worker to its end.

import { beforeAll, expect, test } from "vitest";
import { telemetryGameKey } from "@starreach/app";

import { playOut } from "../helpers/scripted_game.ts";
import { ended, eventRowsOnceThereAre, gameRowOnce } from "../helpers/telemetry_db.ts";
import { PLAYER } from "../helpers/tokens.ts";
import { createGame } from "../helpers/worker.ts";

let created: { gameId: string; view: string };
/** Every row the game left, every column, as the text a reader of the database would get. */
let text: string;

beforeAll(async () => {
  created = await createGame();
  const key = await telemetryGameKey(created.gameId);
  const results = await playOut(created.gameId);
  const events = await eventRowsOnceThereAre(results.length, key);
  text = JSON.stringify([await gameRowOnce(key, ended), events]);
});

test("no column holds the game_id", () => {
  expect(text.includes(created.gameId)).toBe(false);
});

test("no column holds the view_id", () => {
  expect(text.includes(created.view)).toBe(false);
});

test("no column holds the player id", () => {
  expect(text.includes(PLAYER)).toBe(false);
});

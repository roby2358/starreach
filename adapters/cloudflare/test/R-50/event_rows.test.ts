// R-50 (Cloudflare): every tool call on a game played through the Worker leaves its event record
// as a row of the D1 `events` table: the commonly asked fields as columns, the rest as JSON.

import { beforeAll, expect, test } from "vitest";
import { telemetryGameKey, type CommandResult } from "@starreach/app";

import { playScript, SCRIPT, STEP } from "../helpers/scripted_game.ts";
import { eventRows, eventRowsOnceThereAre, gameRows, type Row } from "../helpers/telemetry_db.ts";
import { callTool, createGame } from "../helpers/worker.ts";

let results: CommandResult[];
let rows: Row[];
let key: string;

beforeAll(async () => {
  const played = await playScript();
  results = played.results;
  key = await telemetryGameKey(played.gameId);
  rows = await eventRowsOnceThereAre(SCRIPT.length, key);
});

/** What a row's `rest` column holds. */
function rest(row: Row): { args: Record<string, unknown>; detail: Record<string, unknown> } {
  return JSON.parse(row.rest as string);
}

test("each call leaves one row, numbered from 0 in the order of the calls, with its tool", () => {
  expect(rows.map((row) => row.seq)).toEqual(SCRIPT.map((_, index) => index));
  expect(rows.map((row) => row.tool)).toEqual(SCRIPT.map((step) => step.type));
});

test("a row's columns are the event's fields as the call's Result gives them", () => {
  for (const [index, row] of rows.entries()) {
    const { ok, error, state } = results[index];
    expect(row).toMatchObject({
      game_key: key,
      accepted: ok ? 1 : 0,
      refusal: error,
      energy: state!.ship_energy,
      shields: state!.ship_shields,
      hull: state!.ship_hull,
      torpedoes: state!.ship_quantorpedoes,
    });
  }
});

test("a refused call's row says why, and a query's and a refusal's took no starticks", () => {
  const refused = rows[STEP.refusedBlast];

  expect(refused.accepted).toBe(0);
  expect(refused.refusal).toBe(results[STEP.refusedBlast].error);
  expect(refused.ticks).toBe(0);
  expect(rows[STEP.scan].ticks).toBeGreaterThan(0);
  expect(rows.at(-1)!.ticks).toBe(0);
});

test("the clock, the damage taken and the sectors revealed and cleared are columns", () => {
  expect(rows[STEP.scan].sectors_revealed).toBeGreaterThan(0);
  expect(rows.map((row) => row.sectors_cleared).filter((cleared) => cleared !== 0 && cleared !== 1)).toEqual([]);
  expect(rows.every((row) => Number.isInteger(row.startick) && Number.isInteger(row.damage_taken) && Number.isInteger(row.unix_seconds))).toBe(true);
  expect(rows.map((row) => row.startick)).toEqual([...rows.map((row) => row.startick as number)].sort((a, b) => a - b));
});

test("distance, range and hit are columns where the tool tells them, and null where it doesn't", () => {
  expect(rows[STEP.subwarp]).toMatchObject({ distance: rest(rows[STEP.subwarp]).detail.distance, range: null, hit: null });
  expect(rows[STEP.warp]).toMatchObject({ distance: rest(rows[STEP.warp]).detail.distance, range: null, hit: null });
  expect(rows[STEP.blastMiss]).toMatchObject({ distance: null, range: rest(rows[STEP.blastMiss]).detail.range, hit: 0 });
  expect(rows[STEP.blastKill]).toMatchObject({ distance: null, range: rest(rows[STEP.blastKill]).detail.range, hit: 1 });
  expect(rows[STEP.torpedo]).toMatchObject({ distance: null, range: rest(rows[STEP.torpedo]).detail.range, hit: 1 });
  expect(rows[STEP.dock]).toMatchObject({ distance: null, range: null, hit: null });
  expect(rows[STEP.refusedBlast]).toMatchObject({ distance: null, range: null, hit: null });
  expect(rows[STEP.warp].distance).toBeGreaterThan(0);
  expect(rows[STEP.blastKill].range).toBeGreaterThan(0);
});

test("the rest column holds the arguments without the game_id, and the tool's whole detail", () => {
  expect(rows.map((row) => rest(row).args)).toEqual(SCRIPT.map(({ type: _type, ...args }) => args));
  expect(Object.keys(rest(rows[STEP.blastKill]).detail).sort()).toEqual(["damage", "energy_cost", "hit", "range"]);
  expect(Object.keys(rest(rows[STEP.warp]).detail).sort()).toEqual(["distance", "energy_cost", "shield_recharge"]);
  expect(rest(rows[STEP.dock]).detail).toEqual({});
});

test("a game stored without new_game has event rows and no games row", async () => {
  expect(await gameRows(key)).toEqual([]);
});

test("new_game and whoami leave no event row", async () => {
  const { gameId } = await createGame();
  await callTool("whoami", {});
  await callTool("state", { game_id: gameId });

  const own = await eventRowsOnceThereAre(1, await telemetryGameKey(gameId));

  expect(own.map((row) => row.tool)).toEqual(["state"]);
  expect(await eventRows(key)).toHaveLength(SCRIPT.length);
});

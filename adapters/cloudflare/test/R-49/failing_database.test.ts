// R-49 (Cloudflare): a telemetry database every write to which fails doesn't fail the player's
// command. The tables are dropped, so each insert fails, then put back for the other tests.

import { afterAll, beforeAll, expect, test, vi } from "vitest";
import type { CommandResult } from "@starreach/app";

import { playOut, playScript, SCRIPT } from "../helpers/scripted_game.ts";
import { applySchema, dropTables } from "../helpers/telemetry_db.ts";
import { createGame } from "../helpers/worker.ts";

let working: CommandResult[];
let failing: CommandResult[];
let logged: string[];
let created: { gameId: string; view: string };
let last: CommandResult;

beforeAll(async () => {
  working = (await playScript()).results;
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await dropTables();
  failing = (await playScript()).results;
  await vi.waitFor(() => expect(log.mock.calls.length).toBeGreaterThanOrEqual(SCRIPT.length));
  logged = log.mock.calls.map(([line]) => line as string);
  created = await createGame();
  last = (await playOut(created.gameId)).at(-1)!;
  log.mockRestore();
});

afterAll(applySchema);

test("every command gets the Result it gets with a working database", () => {
  const told = (results: CommandResult[]) => results.map(({ ok, error, state, report }) => ({ ok, error, state, report }));

  expect(told(failing)).toEqual(told(working));
});

test("each failed write is logged", () => {
  expect(logged.filter((line) => line.startsWith("Telemetry not written to D1")).length).toBeGreaterThanOrEqual(SCRIPT.length);
});

test("new_game answers when the database fails", () => {
  expect(created.gameId).toMatch(/^[0-9a-f-]{36}$/);
});

test("a game can end while the database fails", () => {
  expect(last.state!.status).toBe("lost");
});

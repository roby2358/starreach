// R-50 (Cloudflare): a game started through the Worker leaves its game record as a row of the
// D1 `games` table, and the command that ends the game completes that row.

import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { playerHash, RULES_VERSION, telemetryGameKey } from "@starreach/app";

import { D1Telemetry } from "../../src/telemetry.ts";

import { playOut } from "../helpers/scripted_game.ts";
import { ended, eventRowsOnceThereAre, gameRowOnce, written as isWritten } from "../helpers/telemetry_db.ts";
import { nowSeconds, PLAYER } from "../helpers/tokens.ts";
import { callTool, createGame } from "../helpers/worker.ts";

test("new_game leaves one games row with the game record's fields and no end", async () => {
  const before = nowSeconds();
  const { gameId } = await createGame();

  const row = await gameRowOnce(await telemetryGameKey(gameId), isWritten);

  expect(row).toEqual({
    game_key: await telemetryGameKey(gameId),
    started_unix_seconds: expect.any(Number),
    seed: expect.any(Number),
    rules_version: RULES_VERSION,
    player_hash: await playerHash(PLAYER),
    client_name: null,
    client_version: null,
    client_user_agent: null,
    outcome: null,
    ended_by: null,
    rest: null,
  });
  expect(row.started_unix_seconds as number).toBeGreaterThanOrEqual(before);
  expect(Number.isInteger(row.seed)).toBe(true);
});

test("commands on a game that goes on leave the row's end empty", async () => {
  const { gameId } = await createGame();
  const key = await telemetryGameKey(gameId);

  await callTool("long_range_scan", { game_id: gameId });
  await eventRowsOnceThereAre(1, key);

  expect(await gameRowOnce(key, isWritten)).toMatchObject({ outcome: null, ended_by: null, rest: null });
});

test("the command that ends a game completes its row with the outcome, what ended it, the counters and the goals", async () => {
  const { gameId } = await createGame();
  const key = await telemetryGameKey(gameId);

  const results = await playOut(gameId);

  const last = results.at(-1)!.state!;
  const row = await gameRowOnce(key, ended);
  expect(row.outcome).toBe("lost");
  expect(["stranded", "ship_destroyed"]).toContain(row.ended_by);
  const rest = JSON.parse(row.rest as string);
  expect(rest.counters).toEqual(last.counters);
  expect(rest.goals).toEqual((last.goals as { counter: string; amount: number; met: boolean }[]).map(({ counter, amount, met }) => ({ counter, amount, met })));
});

test("each part of the MCP client has its own column", async () => {
  const written: Promise<void>[] = [];
  const sink = new D1Telemetry(env.TELEMETRY, (work) => void written.push(work));
  const key = `client-columns-${crypto.randomUUID()}`;

  await sink.gameStarted({ game_key: key, started_unix_seconds: 1, seed: 2, rules_version: 3, player_hash: "hash", client: { name: "a-client", version: "1.2", user_agent: "an-agent/3" } });
  await Promise.all(written);

  expect(await gameRowOnce(key, isWritten)).toMatchObject({ client_name: "a-client", client_version: "1.2", client_user_agent: "an-agent/3" });
});

// R-52: the telemetry report's two kinds of source give it the same records: the local server's
// dump, line by line, and the D1 tables' rows as wrangler prints them. No test here runs
// wrangler: the D1 source is handed a stand-in that records what it was asked.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  eventFromRow, eventsQuery, gameFromRow, gamesQuery, playFromD1, playFromDump, ReportRefusal, rowsFromWrangler, type Row, type Wrangler,
} from "../../../tools/telemetry_report/records.ts";

import { DAY_1, EVENTS, EVENTS_A, GAME_A, GAME_C, GAMES } from "../helpers/report_play.ts";

/** A game record as the row the Cloudflare sink writes for it (telemetry_schema.sql). */
function gameRow(game: typeof GAME_A): Row {
  const { end, client } = game;
  return {
    game_key: game.game_key, started_unix_seconds: game.started_unix_seconds, seed: game.seed, rules_version: game.rules_version,
    player_hash: game.player_hash, client_name: client.name, client_version: client.version, client_user_agent: client.user_agent,
    outcome: end === null ? null : end.outcome,
    ended_by: end === null ? null : end.ended_by,
    rest: end === null ? null : JSON.stringify({ counters: end.counters, goals: end.goals }),
  };
}

/** An event record as its row: `accepted` and `hit` as 1 or 0, a missing detail part NULL. */
function eventRow(event: (typeof EVENTS)[number]): Row {
  const { args, detail, accepted, ...columns } = event;
  const part = (name: string) => (Object.hasOwn(detail, name) ? Number(detail[name]) : null);
  return { ...columns, accepted: accepted ? 1 : 0, distance: part("distance"), range: part("range"), hit: part("hit"), rest: JSON.stringify({ args, detail }) };
}

/** What `wrangler d1 execute --json` prints for one statement, as seen from wrangler 4.90.0 with --local. */
function wranglerPrints(rows: Row[]): string {
  return JSON.stringify([{ results: rows, success: true, meta: { duration: 0 } }], null, 2);
}

const CONFIG = { path: "some/wrangler.jsonc", text: '{ "database_id": "0123-a-real-id" }' };
const CONFIG_WITHOUT_PRODUCTION = { path: "some/wrangler.jsonc", text: '{ "database_id": "PUT-THE-DATABASE-ID-HERE" }' };

/** A stand-in for wrangler that answers the games query and the events query, and keeps what it was asked. */
function fakeWrangler(asked: string[][]): Wrangler {
  return async (args) => {
    asked.push(args);
    const sql = args[args.length - 1];
    return wranglerPrints(sql.includes("FROM games") ? GAMES.map(gameRow) : EVENTS.map(eventRow));
  };
}

test("the dump's lines become the game records and the event records, as the server holds them", () => {
  const dump = [...GAMES.map((game) => JSON.stringify({ game })), ...EVENTS.map((event) => JSON.stringify({ event }))].map((line) => `${line}\n`).join("");

  assert.deepEqual(playFromDump(dump), { games: GAMES, events: EVENTS });
  assert.deepEqual(playFromDump(""), { games: [], events: [] });
});

test("a games row becomes its game record, ended or open", () => {
  assert.deepEqual(gameFromRow(gameRow(GAME_A)), GAME_A);
  assert.deepEqual(gameFromRow(gameRow(GAME_C)), GAME_C);
});

test("an events row becomes its event record, accepted or refused", () => {
  assert.deepEqual(EVENTS_A.map((event) => eventFromRow(eventRow(event))), EVENTS_A);
});

test("the queries read every column from the period's start on, in a fixed order", () => {
  assert.equal(gamesQuery(DAY_1), `SELECT * FROM games WHERE started_unix_seconds >= ${DAY_1} ORDER BY started_unix_seconds, game_key`);
  assert.equal(eventsQuery(0), "SELECT * FROM events WHERE unix_seconds >= 0 ORDER BY game_key, seq");
  assert.throws(() => gamesQuery(1.5), /Not a whole number/);
  assert.throws(() => eventsQuery(Number("0; DROP TABLE games")), /Not a whole number/);
});

test("wrangler's printed answer gives its rows, and anything but one successful result is an error", () => {
  assert.deepEqual(rowsFromWrangler(wranglerPrints([{ a: 1 }, { a: null }])), [{ a: 1 }, { a: null }]);
  assert.throws(() => rowsFromWrangler(JSON.stringify({ error: { text: "no such table: games: SQLITE_ERROR" } })), /not one successful result.*no such table/);
  assert.throws(() => rowsFromWrangler(JSON.stringify([{ results: [], success: false }])), /not one successful result/);
});

test("the production database is read with two read-only queries through wrangler --remote --env production", async () => {
  const asked: string[][] = [];

  const play = await playFromD1(fakeWrangler(asked), "production", CONFIG, DAY_1);

  const common = ["d1", "execute", "starreach-telemetry", "--remote", "--env", "production", "--config", "some/wrangler.jsonc", "--json", "--command"];
  assert.deepEqual(asked, [[...common, gamesQuery(DAY_1)], [...common, eventsQuery(DAY_1)]]);
  assert.deepEqual(play, { games: GAMES, events: EVENTS });
});

test("wrangler dev's local database is read with the same queries and --local", async () => {
  const asked: string[][] = [];

  const play = await playFromD1(fakeWrangler(asked), "local-d1", CONFIG_WITHOUT_PRODUCTION, 0);

  const common = ["d1", "execute", "starreach-telemetry", "--local", "--config", "some/wrangler.jsonc", "--json", "--command"];
  assert.deepEqual(asked, [[...common, gamesQuery(0)], [...common, eventsQuery(0)]]);
  assert.deepEqual(play, { games: GAMES, events: EVENTS });
});

test("production is not asked while the config holds no production database id: the refusal says what to do", async () => {
  const asked: string[][] = [];

  await assert.rejects(playFromD1(fakeWrangler(asked), "production", CONFIG_WITHOUT_PRODUCTION, 0), (error: Error) => {
    assert.ok(error instanceof ReportRefusal);
    assert.match(error.message, /production telemetry database does not exist yet: some\/wrangler\.jsonc still holds PUT-THE-DATABASE-ID-HERE/);
    assert.match(error.message, /just cf-d1-production/);
    assert.match(error.message, /just telemetry-report local/);
    return true;
  });
  assert.deepEqual(asked, []);
});

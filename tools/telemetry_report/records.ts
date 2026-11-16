// Where the telemetry report's records come from (ONTOLOGY "Telemetry report", D-54): the local
// server's /telemetry dump, or the rows of the D1 telemetry database as `wrangler d1 execute
// --json` prints them. Either way the report gets the same game records and event records.
// Nothing here runs a process or opens a socket: the caller hands in the text it fetched.

import type { EventDetail, EventRecord, GameEnd, GameRecord } from "../../app/src/telemetry.ts";

import type { Play } from "./figures.ts";

/** The records of a `GET /telemetry` body: a `{"game": …}` or `{"event": …}` object per line. */
export function playFromDump(dump: string): Play {
  const lines: { game?: GameRecord; event?: EventRecord }[] = dump
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
  return {
    games: lines.filter((line) => line.game !== undefined).map((line) => line.game!),
    events: lines.filter((line) => line.event !== undefined).map((line) => line.event!),
  };
}

/** A row of a D1 table, as D1 and `wrangler d1 execute --json` give one. */
export type Row = Record<string, unknown>;

/** The games started at or after `since`, every column. */
export function gamesQuery(since: number): string {
  return `SELECT * FROM games WHERE started_unix_seconds >= ${wholeNumber(since)} ORDER BY started_unix_seconds, game_key`;
}

/** The events at or after `since`, every column: a game's events come after its start, so these
 *  hold every event of the games of `gamesQuery(since)`. */
export function eventsQuery(since: number): string {
  return `SELECT * FROM events WHERE unix_seconds >= ${wholeNumber(since)} ORDER BY game_key, seq`;
}

/** The number as SQL text. The queries are sent as text with no bound parameters, so nothing but
 *  a whole number may go into one. */
function wholeNumber(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Not a whole number: ${value}`);
  }
  return String(value);
}

function gameEnd(row: Row): GameEnd | null {
  if (row.outcome === null) {
    return null;
  }
  const rest = JSON.parse(row.rest as string);
  return { outcome: row.outcome as GameEnd["outcome"], ended_by: row.ended_by as GameEnd["ended_by"], counters: rest.counters, goals: rest.goals };
}

/** The game record a `games` row holds. */
export function gameFromRow(row: Row): GameRecord {
  return {
    game_key: row.game_key as string,
    started_unix_seconds: row.started_unix_seconds as number,
    seed: row.seed as number,
    rules_version: row.rules_version as number,
    player_hash: row.player_hash as string,
    client: { name: row.client_name as string | null, version: row.client_version as string | null, user_agent: row.client_user_agent as string | null },
    end: gameEnd(row),
  };
}

/** The parts of an event's detail that the `events` table holds in columns of their own
 *  (telemetry_schema.sql), each with how its column's value reads as the detail's. */
const DETAIL_COLUMNS: Record<string, (stored: unknown) => number | boolean> = {
  distance: (stored) => stored as number,
  range: (stored) => stored as number,
  hit: (stored) => stored === 1,
};

/** The detail parts a row's columns hold: a NULL column is a part the tool didn't tell. */
function detailFromColumns(row: Row): EventDetail {
  const told = Object.entries(DETAIL_COLUMNS).filter(([part]) => row[part] !== null);
  return Object.fromEntries(told.map(([part, read]) => [part, read(row[part])]));
}

/** The event record an `events` row holds. `args` are in its `rest`; its `detail` is the parts
 *  in `rest` and the parts in columns together, and a column wins over a part of the same name
 *  in `rest`, which a row written while `rest` held the whole detail has. */
export function eventFromRow(row: Row): EventRecord {
  const rest = JSON.parse(row.rest as string);
  return {
    game_key: row.game_key as string,
    unix_seconds: row.unix_seconds as number,
    tool: row.tool as string,
    args: rest.args,
    accepted: row.accepted === 1,
    refusal: row.refusal as string | null,
    startick: row.startick as number,
    ticks: row.ticks as number,
    energy: row.energy as number,
    shields: row.shields as number,
    hull: row.hull as number,
    torpedoes: row.torpedoes as number,
    damage_taken: row.damage_taken as number,
    sectors_revealed: row.sectors_revealed as number,
    sectors_cleared: row.sectors_cleared as number,
    detail: { ...rest.detail, ...detailFromColumns(row) },
    seq: row.seq as number,
  };
}

/** The records the rows of the two queries hold. */
export function playFromRows(gameRows: Row[], eventRows: Row[]): Play {
  return { games: gameRows.map(gameFromRow), events: eventRows.map(eventFromRow) };
}

/** The rows in what `wrangler d1 execute --json --command <one statement>` prints: a list with
 *  one `{results, success}` per statement. */
export function rowsFromWrangler(output: string): Row[] {
  const answers = JSON.parse(output);
  if (!Array.isArray(answers) || answers.length !== 1 || answers[0].success !== true || !Array.isArray(answers[0].results)) {
    throw new Error(`wrangler's answer is not one successful result: ${output.slice(0, 200)}`);
  }
  return answers[0].results;
}

/** How wrangler is told which database to read: the local one under .wrangler/, or production's. */
export const D1_TARGETS = {
  "local-d1": ["--local"],
  production: ["--remote", "--env", "production"],
} as const;

export type D1Target = keyof typeof D1_TARGETS;

/** The database's name in wrangler.jsonc, as tools/telemetry_db.sh has it. */
const DATABASE = "starreach-telemetry";

/** What wrangler.jsonc's production environment holds until the production database exists, as
 *  tools/telemetry_db.sh has it. */
const ID_PLACEHOLDER = "PUT-THE-DATABASE-ID-HERE";

/** Runs wrangler with the arguments and resolves with what it printed to stdout. */
export type Wrangler = (args: string[]) => Promise<string>;

/** Thrown for what the person running the report can put right; its message says how. */
export class ReportRefusal extends Error {}

/** The records of a D1 telemetry database from `since` on, read by two read-only queries through
 *  wrangler. Production is not asked while the config still holds the placeholder id: the
 *  database doesn't exist yet. */
export async function playFromD1(wrangler: Wrangler, target: D1Target, config: { path: string; text: string }, since: number): Promise<Play> {
  if (target === "production" && config.text.includes(ID_PLACEHOLDER)) {
    throw new ReportRefusal(
      `the production telemetry database does not exist yet: ${config.path} still holds ${ID_PLACEHOLDER}.\n` +
        "create it with: just cf-d1-production (see the starreach-recipes skill, \"Deploying\"), or report on local play with: just telemetry-report local",
    );
  }
  const query = async (sql: string) => rowsFromWrangler(await wrangler(["d1", "execute", DATABASE, ...D1_TARGETS[target], "--config", config.path, "--json", "--command", sql]));
  return playFromRows(await query(gamesQuery(since)), await query(eventsQuery(since)));
}

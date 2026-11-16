// R-52 (Cloudflare): the telemetry report's queries, run on the D1 database, give back the very
// records the Worker's sink wrote there, so the report over D1 is the report over the records.
// The database is workerd's local one with the tables of the schema file; `all()` gives a
// statement's rows as `wrangler d1 execute --json` prints them under `results`.

import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import type { EventRecord, GameRecord } from "@starreach/app";

import { eventsQuery, gamesQuery, playFromRows, type Row } from "../../../../tools/telemetry_report/records.ts";
import { report } from "../../../../tools/telemetry_report/render.ts";
import { DAY_1, EVENTS, GAMES } from "../../../../app/test/helpers/report_play.ts";

import { D1Telemetry } from "../../src/telemetry.ts";

/** Moves the fixed records a century on, past every row another test leaves in the shared
 *  database, and gives them keys of this run's own. */
const LATER = 100 * 365 * 86_400;
const RUN = crypto.randomUUID();
const games: GameRecord[] = GAMES.map((game) => ({ ...game, game_key: `${RUN}-${game.game_key}`, started_unix_seconds: game.started_unix_seconds + LATER }));
const events: EventRecord[] = EVENTS.map((event) => ({ ...event, game_key: `${RUN}-${event.game_key}`, unix_seconds: event.unix_seconds + LATER }));

/** Writes the records through the Worker's sink, one write landing before the next starts, so
 *  the database numbers each game's events in their order. */
async function writeThroughTheSink(): Promise<void> {
  const landing: Promise<void>[] = [];
  const sink = new D1Telemetry(env.TELEMETRY, (work) => landing.push(work));
  const landed = async (write: Promise<void>) => {
    await write;
    await landing.at(-1);
  };
  for (const { end, ...start } of games) {
    await landed(sink.gameStarted(start));
  }
  for (const event of events) {
    await landed(sink.commandRun(event));
  }
  for (const game of games.filter((each) => each.end !== null)) {
    await landed(sink.gameEnded(game.game_key, game.end!));
  }
}

async function rows(sql: string): Promise<Row[]> {
  return (await env.TELEMETRY.prepare(sql).all<Row>()).results;
}

const byKeyAndSeq = (a: EventRecord, b: EventRecord) => a.game_key.localeCompare(b.game_key) || a.seq - b.seq;
const byStartAndKey = (a: GameRecord, b: GameRecord) => a.started_unix_seconds - b.started_unix_seconds || a.game_key.localeCompare(b.game_key);

test("the report's queries read back the records the sink wrote, and the report over them is the same", async () => {
  await writeThroughTheSink();

  const play = playFromRows(await rows(gamesQuery(DAY_1 + LATER)), await rows(eventsQuery(DAY_1 + LATER)));

  expect(play.games).toEqual([...games].sort(byStartAndKey));
  expect(play.events).toEqual([...events].sort(byKeyAndSeq));
  const heading = { source: "the test's database", period: "all time", since: 0 };
  expect(report(play, heading)).toBe(report({ games, events }, heading));
  expect(report(play, heading)).toContain("3 games, 19 tool calls; rules version: 1");
});

test("a row written with the whole detail in rest reads back as the same record", async () => {
  const shot = events.find((event) => event.tool === "blast")!;
  const earlier: EventRecord = { ...shot, game_key: `${RUN}-earlier`, seq: 0 };
  const rest = JSON.stringify({ args: earlier.args, detail: earlier.detail });
  await env.TELEMETRY
    .prepare("INSERT INTO events (game_key, seq, unix_seconds, tool, accepted, refusal, startick, ticks, energy, shields, hull, torpedoes, damage_taken, sectors_revealed, sectors_cleared, distance, range, hit, rest) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL, ?16, ?17, ?18)")
    .bind(
      earlier.game_key, earlier.seq, earlier.unix_seconds, earlier.tool, earlier.accepted, earlier.refusal, earlier.startick, earlier.ticks,
      earlier.energy, earlier.shields, earlier.hull, earlier.torpedoes, earlier.damage_taken, earlier.sectors_revealed, earlier.sectors_cleared,
      earlier.detail.range, earlier.detail.hit, rest,
    )
    .run();

  const read = playFromRows([], await rows(eventsQuery(DAY_1 + LATER))).events.filter((event) => event.game_key === earlier.game_key);

  expect(read).toEqual([earlier]);
});

test("the queries leave out what came before the period's start", async () => {
  const afterEverything = DAY_1 + 2 * LATER;

  expect(await rows(gamesQuery(afterEverything))).toEqual([]);
  expect(await rows(eventsQuery(afterEverything))).toEqual([]);
});

// The app's Telemetry on Cloudflare (D-53): each record becomes a row of the D1 database bound
// as TELEMETRY, whose tables are in ../telemetry_schema.sql. A write is started and handed to
// the request's waitUntil, so the player's reply never waits on the database, and a write that
// fails is logged and dropped.

import type { CommandEvent, EventDetail, GameEnd, GameStart, Telemetry } from "@starreach/app";

const INSERT_GAME = `
  INSERT INTO games (game_key, started_unix_seconds, seed, rules_version, player_hash, client_name, client_version, client_user_agent)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`;

const END_GAME = `UPDATE games SET outcome = ?2, ended_by = ?3, rest = ?4 WHERE game_key = ?1`;

/** The event's `seq` is the count of its game's events so far, taken inside the insert, so the
 *  database numbers a game's events in the order it gets them. */
const INSERT_EVENT = `
  INSERT INTO events (game_key, seq, unix_seconds, tool, accepted, refusal, startick, ticks, energy, shields, hull, torpedoes,
    damage_taken, sectors_revealed, sectors_cleared, distance, range, hit, rest)
  VALUES (?1, (SELECT COUNT(*) FROM events WHERE game_key = ?1), ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`;

/** The parts of an event's detail that have their own columns, in the order INSERT_EVENT binds
 *  them. Each is stored there and nowhere else: `rest` holds the detail without them. */
const DETAIL_COLUMNS = ["distance", "range", "hit"];

/** A part of an event's detail that has its own column, or null where the tool tells none. */
function detailColumn(detail: EventDetail, part: string): number | boolean | null {
  return Object.hasOwn(detail, part) ? detail[part] : null;
}

/** The detail's parts that have no column of their own. */
function detailWithoutColumns(detail: EventDetail): EventDetail {
  return Object.fromEntries(Object.entries(detail).filter(([part]) => !DETAIL_COLUMNS.includes(part)));
}

/** Keeps work going after the reply is sent: a request's `ctx.waitUntil`. */
export type Background = (work: Promise<void>) => void;

export class D1Telemetry implements Telemetry {
  private readonly db: D1Database;
  private readonly background: Background;

  constructor(db: D1Database, background: Background) {
    this.db = db;
    this.background = background;
  }

  async gameStarted(start: GameStart): Promise<void> {
    this.write(async () => {
      const { client } = start;
      await this.db
        .prepare(INSERT_GAME)
        .bind(start.game_key, start.started_unix_seconds, start.seed, start.rules_version, start.player_hash, client.name, client.version, client.user_agent)
        .run();
    });
  }

  async gameEnded(gameKey: string, end: GameEnd): Promise<void> {
    this.write(async () => {
      const rest = JSON.stringify({ counters: end.counters, goals: end.goals });
      const done = await this.db.prepare(END_GAME).bind(gameKey, end.outcome, end.ended_by, rest).run();
      if (done.meta.changes === 0) {
        throw new Error("No game row to complete");
      }
    });
  }

  async commandRun(event: CommandEvent): Promise<void> {
    this.write(async () => {
      const rest = JSON.stringify({ args: event.args, detail: detailWithoutColumns(event.detail) });
      await this.db
        .prepare(INSERT_EVENT)
        .bind(
          event.game_key, event.unix_seconds, event.tool, event.accepted, event.refusal, event.startick, event.ticks,
          event.energy, event.shields, event.hull, event.torpedoes, event.damage_taken, event.sectors_revealed, event.sectors_cleared,
          ...DETAIL_COLUMNS.map((part) => detailColumn(event.detail, part)), rest,
        )
        .run();
    });
  }

  /** Starts a write and leaves it to finish in the background. The caller doesn't wait for it,
   *  and its failure goes to the log and no further. */
  private write(row: () => Promise<void>): void {
    this.background(row().catch((error) => console.error(`Telemetry not written to D1: ${(error as Error).message}`)));
  }
}

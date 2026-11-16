// The telemetry database in the tests: the schema file applied to the local D1 database behind
// the TELEMETRY binding, and reads of its rows once the Worker's background writes have landed.

import { env } from "cloudflare:workers";
import { expect, vi } from "vitest";

import schema from "../../telemetry_schema.sql";

/** The schema file's statements, its `--` comments left out. */
function statements(sql: string): string[] {
  return sql
    .replaceAll(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
}

/** Applies telemetry_schema.sql. Safe to run again, as the file is. */
export async function applySchema(): Promise<void> {
  await env.TELEMETRY.batch(statements(schema).map((statement) => env.TELEMETRY.prepare(statement)));
}

/** Drops both tables, so every write to the database fails until the schema is applied again. */
export async function dropTables(): Promise<void> {
  await env.TELEMETRY.batch([env.TELEMETRY.prepare("DROP TABLE IF EXISTS events"), env.TELEMETRY.prepare("DROP TABLE IF EXISTS games")]);
}

export type Row = Record<string, unknown>;

/** How long a test waits for the Worker's background writes, well inside a test's own timeout. */
const WRITES_LAND_WITHIN = { timeout: 4000, interval: 25 };

export async function gameRows(gameKey: string): Promise<Row[]> {
  return (await env.TELEMETRY.prepare("SELECT * FROM games WHERE game_key = ?1").bind(gameKey).all<Row>()).results;
}

/** A game's event rows, in `seq` order. */
export async function eventRows(gameKey: string): Promise<Row[]> {
  return (await env.TELEMETRY.prepare("SELECT * FROM events WHERE game_key = ?1 ORDER BY seq").bind(gameKey).all<Row>()).results;
}

/** A game's event rows once there are `count` of them. The Worker writes them after its reply,
 *  so a test waits for them here. */
export function eventRowsOnceThereAre(count: number, gameKey: string): Promise<Row[]> {
  return vi.waitFor(async () => {
    const rows = await eventRows(gameKey);
    expect(rows).toHaveLength(count);
    return rows;
  }, WRITES_LAND_WITHIN);
}

/** A game's row once it is there and `ready` for the test: written, or completed. */
export function gameRowOnce(gameKey: string, ready: (row: Row) => boolean): Promise<Row> {
  return vi.waitFor(async () => {
    const rows = await gameRows(gameKey);
    expect(rows.length === 1 && ready(rows[0])).toBe(true);
    return rows[0];
  }, WRITES_LAND_WITHIN);
}

export const written = (_row: Row): boolean => true;
export const ended = (row: Row): boolean => row.outcome !== null;

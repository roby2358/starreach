// R-49 (Cloudflare): the D1 sink's writes return before the database answers, so the player's
// reply never waits on it. The database here never answers at all.

import { expect, test } from "vitest";
import type { CommandEvent, GameEnd, GameStart } from "@starreach/app";

import { D1Telemetry } from "../../src/telemetry.ts";

/** A database whose every statement stays unanswered. */
const SILENT = { prepare: () => ({ bind: () => ({ run: () => new Promise(() => {}) }) }) } as unknown as D1Database;

const START: GameStart = { game_key: "k", started_unix_seconds: 1, seed: 2, rules_version: 1, player_hash: "h", client: { name: null, version: null, user_agent: null } };
const END: GameEnd = { outcome: "lost", ended_by: "stranded", counters: {}, goals: [] };
const EVENT: CommandEvent = {
  game_key: "k", unix_seconds: 1, tool: "state", args: {}, accepted: true, refusal: null, startick: 0, ticks: 0,
  energy: 0, shields: 0, hull: 0, torpedoes: 0, damage_taken: 0, sectors_revealed: 0, sectors_cleared: 0, detail: {},
};

/** A sink over the silent database, and the writes it handed to the background. */
function silentSink(): { sink: D1Telemetry; background: Promise<void>[] } {
  const background: Promise<void>[] = [];
  return { sink: new D1Telemetry(SILENT, (work) => void background.push(work)), background };
}

test("a game's start returns with its write still under way, handed to the background", async () => {
  const { sink, background } = silentSink();

  await sink.gameStarted(START);

  expect(background).toHaveLength(1);
});

test("a command's event returns with its write still under way, handed to the background", async () => {
  const { sink, background } = silentSink();

  await sink.commandRun(EVENT);

  expect(background).toHaveLength(1);
});

test("a game's end returns with its write still under way, handed to the background", async () => {
  const { sink, background } = silentSink();

  await sink.gameEnded("k", END);

  expect(background).toHaveLength(1);
});

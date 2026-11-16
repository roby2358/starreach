// The fixed records the telemetry report's tests sum (R-52): three games under one rules version,
// written out by hand so that every figure of the report has an answer worked out on paper.
// The records need not be a game the rules could play; only their fields matter.
//
//   A  player p1, day 1, ended lost (ship destroyed), 1 goal of 3 met, 13 events: 11 played, then
//      a query and a refusal after the end. Its last gap is a long pause of 410 s.
//   B  player p1, day 2, ended won, 3 goals of 3 met, 3 events.
//   C  player p2, day 1, still open, 3 events.

import type { EventDetail, EventRecord, GameEnd, GameRecord, McpClient } from "../../src/index.ts";

/** Midnight UTC on 2026-11-16. */
export const DAY_1 = 20_773 * 86_400;
export const DAY_2 = DAY_1 + 86_400;

const NO_CLIENT: McpClient = { name: null, version: null, user_agent: null };

function goals(met: number): GameEnd["goals"] {
  return ["docks", "scans", "blasts_hit"].map((counter, index) => ({ counter, amount: 1, met: index < met }));
}

export function game(key: string, fields: Partial<GameRecord>): GameRecord {
  return { game_key: key, started_unix_seconds: DAY_1, seed: 1, rules_version: 1, player_hash: "p1", client: NO_CLIENT, end: null, ...fields };
}

/** An accepted event that took no time and changed nothing, with `fields` over it. */
export function event(key: string, seq: number, tool: string, unixSeconds: number, fields: Partial<EventRecord>): EventRecord {
  return {
    game_key: key, seq, unix_seconds: unixSeconds, tool, args: {}, accepted: true, refusal: null, startick: 0, ticks: 0,
    energy: 50_000, shields: 3000, hull: 2000, torpedoes: 7, damage_taken: 0, sectors_revealed: 0, sectors_cleared: 0, detail: {},
    ...fields,
  };
}

function refused(key: string, seq: number, tool: string, unixSeconds: number, refusal: string, fields: Partial<EventRecord>): EventRecord {
  return event(key, seq, tool, unixSeconds, { accepted: false, refusal, ...fields });
}

const warp = (distance: number, energy_cost: number): EventDetail => ({ distance, energy_cost, shield_recharge: 0 });
const blast = (range: number, hit: boolean): EventDetail => ({ range, hit, energy_cost: 1500, damage: hit ? 1000 : 0 });

export const GAME_A = game("A", {
  client: { name: "claude-code", version: "2.0", user_agent: null },
  end: { outcome: "lost", ended_by: "ship_destroyed", counters: { sectors_cleared: 1 }, goals: goals(1) },
});

export const EVENTS_A: EventRecord[] = [
  event("A", 0, "galaxy_map", DAY_1 + 10, {}),
  event("A", 1, "galaxy_warp", DAY_1 + 20, { ticks: 416, energy: 45_840, detail: warp(1, 4160) }),
  event("A", 2, "long_range_scan", DAY_1 + 30, { ticks: 3, energy: 45_340, sectors_revealed: 8 }),
  event("A", 3, "subwarp", DAY_1 + 40, { ticks: 3, energy: 45_334, detail: { distance: 3, energy_cost: 6 } }),
  refused("A", 4, "subwarp", DAY_1 + 45, "No clear path toward (6, 1)", { energy: 45_334 }),
  event("A", 5, "blast", DAY_1 + 50, { ticks: 1, energy: 43_839, sectors_cleared: 1, detail: blast(2.24, true) }),
  refused("A", 6, "blast", DAY_1 + 60, "No enemy in beam path", { energy: 43_839 }),
  event("A", 7, "galaxy_warp", DAY_1 + 70, { ticks: 529, energy: 38_000, detail: warp(2.83, 5290) }),
  event("A", 8, "blast", DAY_1 + 80, { ticks: 2, energy: 35_000, hull: 900, damage_taken: 1100, detail: blast(5.1, false) }),
  event("A", 9, "torpedo", DAY_1 + 90, { ticks: 1, energy: 34_900, hull: 400, torpedoes: 6, detail: { range: 5, hit: true } }),
  event("A", 10, "long_range_scan", DAY_1 + 500, { ticks: 3, energy: 300, hull: 0 }),
  event("A", 11, "state", DAY_1 + 600, { energy: 300, hull: 0 }),
  refused("A", 12, "subwarp", DAY_1 + 610, "The game is over", { energy: 300, hull: 0 }),
];

export const GAME_B = game("B", {
  started_unix_seconds: DAY_2,
  client: { name: null, version: null, user_agent: "curl/8" },
  end: { outcome: "won", ended_by: "galaxy_cleared", counters: { sectors_cleared: 1 }, goals: goals(3) },
});

export const EVENTS_B: EventRecord[] = [
  event("B", 0, "galaxy_warp", DAY_2 + 5, { ticks: 420, energy: 45_700, detail: warp(1.41, 4300) }),
  event("B", 1, "dock", DAY_2 + 10, { ticks: 5 }),
  event("B", 2, "blast", DAY_2 + 20, { ticks: 1, energy: 48_000, sectors_cleared: 1, detail: blast(2, true) }),
];

export const GAME_C = game("C", { started_unix_seconds: DAY_1 + 100, player_hash: "p2" });

export const EVENTS_C: EventRecord[] = [
  event("C", 0, "state", DAY_1 + 130, {}),
  event("C", 1, "subwarp", DAY_1 + 140, { ticks: 1, energy: 49_998, detail: { distance: 1, energy_cost: 2 } }),
  refused("C", 2, "subwarp", DAY_1 + 150, "No clear path toward (2, 2)", { energy: 49_998 }),
];

export const GAMES: GameRecord[] = [GAME_A, GAME_B, GAME_C];
export const EVENTS: EventRecord[] = [...EVENTS_A, ...EVENTS_B, ...EVENTS_C];

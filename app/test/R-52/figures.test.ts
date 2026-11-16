// R-52: the telemetry report's figures, section by section, over the fixed records of
// helpers/report_play.ts, whose answers are worked out by hand in the comments there and here.

import assert from "node:assert/strict";
import { test } from "node:test";

import { byRulesVersion, clientLabel, figures, GAME_TOOLS, inPeriod, reasonKind, summarize, type Figures } from "../../../tools/telemetry_report/figures.ts";

import { connectClient, testDeps } from "../helpers/deps.ts";
import { DAY_1, DAY_2, event, EVENTS, EVENTS_A, EVENTS_C, game, GAME_A, GAME_B, GAME_C, GAMES } from "../helpers/report_play.ts";

const all: Figures = figures({ games: GAMES, events: EVENTS });

test("a summary gives the count, total, least, median, mean and most", () => {
  assert.deepEqual(summarize([5, 1, 3]), { count: 3, total: 9, min: 1, median: 3, mean: 3, max: 5 });
  assert.deepEqual(summarize([4, 1, 2, 9]), { count: 4, total: 16, min: 1, median: 3, mean: 4, max: 9 });
  assert.deepEqual(summarize([]), { count: 0, total: 0, min: 0, median: 0, mean: 0, max: 0 });
});

test("tool calls: each tool's calls, accepted and refused, the most called first, calls after a game's end included", () => {
  assert.deepEqual(all.toolCalls.used, [
    { tool: "subwarp", calls: 5, accepted: 2, refused: 3 },
    { tool: "blast", calls: 4, accepted: 3, refused: 1 },
    { tool: "galaxy_warp", calls: 3, accepted: 3, refused: 0 },
    { tool: "long_range_scan", calls: 2, accepted: 2, refused: 0 },
    { tool: "state", calls: 2, accepted: 2, refused: 0 },
    { tool: "dock", calls: 1, accepted: 1, refused: 0 },
    { tool: "galaxy_map", calls: 1, accepted: 1, refused: 0 },
    { tool: "torpedo", calls: 1, accepted: 1, refused: 0 },
  ]);
  assert.deepEqual(all.toolCalls.neverUsed, []);
});

test("tool calls: the tools never used are the game's tools with no event", () => {
  const onlyC = figures({ games: [GAME_C], events: EVENTS_C });

  assert.deepEqual(onlyC.toolCalls.neverUsed, ["galaxy_map", "galaxy_warp", "dock", "long_range_scan", "blast", "torpedo"]);
});

test("the game's tools are the MCP server's tools that run on a game", async () => {
  const listed = (await (await connectClient(testDeps())).listTools()).tools.map((tool) => tool.name);

  assert.deepEqual([...GAME_TOOLS].sort(), listed.filter((name) => name !== "new_game" && name !== "whoami").sort());
});

test("subwarp: accepted moves by cells moved", () => {
  assert.deepEqual(all.subwarp, [{ distance: 1, count: 1 }, { distance: 3, count: 1 }]);
});

test("warp: accepted warps by distance to the nearest whole sector, with their energy cost", () => {
  // 1 and 1.41 sectors are both 1: costs 4160 and 4300. 2.83 sectors is 3: cost 5290.
  assert.deepEqual(all.warp, [
    { distance: 1, energyCost: { count: 2, total: 8460, min: 4160, median: 4230, mean: 4230, max: 4300 } },
    { distance: 3, energyCost: { count: 1, total: 5290, min: 5290, median: 5290, mean: 5290, max: 5290 } },
  ]);
});

test("blast: accepted blasts by range to the nearest whole cell, with hits and damage", () => {
  // Ranges 2.24 (hit) and 2 (hit) are both 2; range 5.1 missed.
  assert.deepEqual(all.blast, [
    { range: 2, shots: 2, hits: 2, damage: 2000 },
    { range: 5, shots: 1, hits: 0, damage: 0 },
  ]);
});

test("torpedo: accepted torpedoes by range, with hits", () => {
  assert.deepEqual(all.torpedo, [{ range: 5, shots: 1, hits: 1 }]);
});

test("per game: sectors cleared, sectors revealed and dockings, over every game", () => {
  assert.deepEqual(all.perGame, {
    sectorsCleared: summarize([1, 1, 0]),
    sectorsRevealed: summarize([8, 0, 0]),
    dockings: summarize([0, 1, 0]),
  });
});

test("refusals: the reasons with their numbers taken out, the most common first", () => {
  assert.deepEqual(all.refusals, [
    { reason: "No clear path toward (N, N)", count: 2 },
    { reason: "No enemy in beam path", count: 1 },
    { reason: "The game is over", count: 1 },
  ]);
  assert.equal(reasonKind("Enemy at (3, 4) is out of blast range (9.22 > 9)"), "Enemy at (N, N) is out of blast range (N > N)");
});

test("looking before leaping: each accepted warp by what was looked at since the warp before", () => {
  // A's first warp follows a galaxy map, its second a scan; B's warp follows nothing.
  assert.deepEqual(all.looking, { warps: 3, afterScan: 1, afterMap: 1, afterEither: 2, afterNeither: 1 });
});

test("looking before leaping: a refused scan is no look, and one look serves one warp only", () => {
  const key = "L";
  const warp = (seq: number) => event(key, seq, "galaxy_warp", DAY_1, { detail: { distance: 1, energy_cost: 1, shield_recharge: 0 } });
  const events = [
    event(key, 0, "long_range_scan", DAY_1, { accepted: false, refusal: "Insufficient energy" }),
    warp(1),
    event(key, 2, "galaxy_map", DAY_1, {}),
    event(key, 3, "long_range_scan", DAY_1, {}),
    warp(4),
    warp(5),
  ];

  assert.deepEqual(figures({ games: [game(key, {})], events }).looking, { warps: 3, afterScan: 1, afterMap: 1, afterEither: 1, afterNeither: 2 });
});

test("games: started per UTC day, ended by outcome and cause, and still open", () => {
  assert.deepEqual(all.games.startedPerDay, [{ day: "2026-11-16", games: 2 }, { day: "2026-11-17", games: 1 }]);
  assert.deepEqual(all.games.endings, [
    { outcome: "lost", endedBy: "ship_destroyed", games: 1 },
    { outcome: "won", endedBy: "galaxy_cleared", games: 1 },
  ]);
  assert.equal(all.games.open, 1);
});

test("games: length in commands and starticks, an ended game's up to the command that ended it", () => {
  // A: 11 events to its ending scan (the two after it left out), 416+3+3+1+529+2+1+3 = 958 starticks.
  // B: 3 events, 420+5+1 = 426 starticks. C, open: 3 events, 1 startick.
  assert.deepEqual(all.games.ended, { commands: summarize([11, 3]), starticks: summarize([958, 426]) });
  assert.deepEqual(all.games.stillOpen, { commands: summarize([3]), starticks: summarize([1]) });
});

test("games: how many ended games met each number of goals", () => {
  assert.deepEqual(all.games.goalsMet, [{ met: 0, games: 0 }, { met: 1, games: 1 }, { met: 2, games: 0 }, { met: 3, games: 1 }]);
});

test("energy: the lowest each game's energy ran", () => {
  assert.deepEqual(all.energy.lowest, summarize([300, 45_700, 49_998]));
});

test("energy: a lost game's energy and hull before its last command and at its end, by what ended it", () => {
  assert.deepEqual(all.energy.badEndings, [
    {
      endedBy: "ship_destroyed",
      games: 1,
      energyBefore: summarize([34_900]),
      hullBefore: summarize([400]),
      energyAtEnd: summarize([300]),
      hullAtEnd: summarize([0]),
    },
  ]);
});

test("wall-clock: gaps between commands from new_game on, long pauses, and a game's real length with and without them", () => {
  // A: eight gaps of 10 s and two of 5 s (90 s), then one of 410 s. B: 5, 5, 10. C: 30, 10, 10.
  const gaps = [10, 10, 10, 10, 5, 5, 10, 10, 10, 10, 410, 5, 5, 10, 30, 10, 10];
  assert.deepEqual(all.wallClock, {
    gaps: summarize(gaps),
    longPauses: 1,
    realLength: summarize([500, 20, 50]),
    activeLength: summarize([90, 20, 50]),
  });
  assert.equal(all.wallClock.gaps.median, 10);
});

test("players: distinct, with several games, and returning on another day; games per client", () => {
  assert.deepEqual(all.players, {
    distinct: 2,
    severalGames: 1,
    returning: 1,
    clients: [{ client: "claude-code 2.0", games: 1 }, { client: "curl/8", games: 1 }, { client: "unknown", games: 1 }],
  });
  assert.equal(clientLabel(game("x", { client: { name: "claude-ai", version: null, user_agent: "ua" } })), "claude-ai");
});

test("a game with no events counts as a game and adds nothing to what is summed over events", () => {
  const bare = figures({ games: [game("bare", {})], events: [] });

  assert.deepEqual(bare.games.stillOpen.commands, summarize([0]));
  assert.deepEqual(bare.energy.lowest, summarize([]));
  assert.deepEqual(bare.wallClock.realLength, summarize([]));
  assert.deepEqual(bare.toolCalls.neverUsed, GAME_TOOLS);
});

test("the period keeps the games started in it with all their events, and counts events with no game record", () => {
  const orphan = event("no-such-game", 0, "state", DAY_2 + 50, {});

  const { play, orphanEvents } = inPeriod({ games: GAMES, events: [...EVENTS, orphan] }, DAY_2);

  assert.deepEqual(play.games, [GAME_B]);
  assert.deepEqual(play.events.map((each) => each.game_key), ["B", "B", "B"]);
  assert.equal(orphanEvents, 1);
});

test("a period from the start of time keeps every game", () => {
  const { play, orphanEvents } = inPeriod({ games: GAMES, events: EVENTS }, 0);

  assert.deepEqual(play, { games: GAMES, events: EVENTS });
  assert.equal(orphanEvents, 0);
});

test("the play splits by rules version, lowest first, each game's events with it", () => {
  const newer = game("N", { rules_version: 2 });
  const newerEvent = event("N", 0, "state", DAY_1, {});

  const split = byRulesVersion({ games: [newer, GAME_A], events: [newerEvent, ...EVENTS_A] });

  assert.deepEqual(split, [
    { rulesVersion: 1, play: { games: [GAME_A], events: EVENTS_A } },
    { rulesVersion: 2, play: { games: [newer], events: [newerEvent] } },
  ]);
});

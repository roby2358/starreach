// R-52: the telemetry report as text: game time and real time as they are printed, the tables,
// the order of the sections, the period, and the split by rules version.

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDuration, formatNumber, formatSeconds, formatShare, report, table, type Heading } from "../../../tools/telemetry_report/render.ts";

import { START_UNIX_SECONDS, testDeps } from "../helpers/deps.ts";
import { DAY_1, DAY_2, event, EVENTS, game, GAMES } from "../helpers/report_play.ts";

const ALL_TIME: Heading = { source: "the test's records", period: "all time", since: 0 };

/** The report's lines, for looking a line up by how it starts. */
function lineStarting(text: string, start: string): string {
  const found = text.split("\n").filter((line) => line.trimStart().startsWith(start));
  assert.equal(found.length, 1, `lines starting "${start}"`);
  return found[0].trim().replaceAll(/ {2,}/g, " | ");
}

test("a length of game time is printed as the game prints one", () => {
  assert.equal(formatDuration(416), "1.04.0");
  assert.equal(formatDuration(1), "0.00.2");
  assert.equal(formatDuration(0), "0.00.0");
  assert.equal(formatDuration(958), "2.39.5");
});

test("a length of game time matches the core's own report of a warp and a scan", () => {
  const { core } = testDeps();
  const started = core.newGame(7, START_UNIX_SECONDS);

  const scan = core.apply(started, { type: "long_range_scan" })!.result;
  const warp = core.apply(started, { type: "galaxy_warp", x: 5, y: 4 })!.result;

  assert.equal(formatDuration(3), scan.report!.time);
  assert.equal(formatDuration(416), warp.report!.time);
});

test("real time is printed in seconds, minutes and hours", () => {
  assert.equal(formatSeconds(45), "45s");
  assert.equal(formatSeconds(125), "2m 05s");
  assert.equal(formatSeconds(3723), "1h 02m 03s");
  assert.equal(formatSeconds(0.4), "0s");
});

test("numbers and shares", () => {
  assert.equal(formatNumber(7), "7");
  assert.equal(formatNumber(2 / 3), "0.7");
  assert.equal(formatShare(1, 3), "33%");
  assert.equal(formatShare(0, 0), "-");
});

test("a table aligns its first column left and the others right, and says when it has no rows", () => {
  assert.equal(table(["tool", "calls"], [["subwarp", 5], ["dock", 12]]), "  tool     calls\n  subwarp      5\n  dock        12");
  assert.equal(table(["tool", "calls"], []), "  (none)");
});

test("the report says its source, period and size, then prints its sections in order", () => {
  const text = report({ games: GAMES, events: EVENTS }, ALL_TIME);

  const titles = text.split("\n").filter((line) => line !== "" && !line.startsWith(" "));
  assert.deepEqual(text.split("\n").slice(0, 4), [
    "Starreach telemetry report",
    "  source: the test's records",
    "  period: all time",
    "  3 games, 19 tool calls; rules version: 1",
  ]);
  assert.deepEqual(titles.slice(1).map((title) => title.split(/[:(]/)[0].trim()), [
    "Tool calls",
    "Subwarp",
    "Warp",
    "Blast",
    "Torpedo",
    "Per game",
    "Refusals",
    "Looking before leaping",
    "Games started per day",
    "Games ended, by outcome and what ended them",
    "Game length",
    "Goals met per ended game",
    "Energy",
    "Games that ended badly",
    "Wall-clock",
    "Players, by anonymous hash",
    "Games per MCP client",
  ]);
  assert.ok(text.endsWith("\n"));
});

test("the report prints the figures: counts, shares, game time as d.dd.d and real time", () => {
  const text = report({ games: GAMES, events: EVENTS }, ALL_TIME);

  assert.equal(lineStarting(text, "subwarp"), "subwarp | 5 | 2 | 3");
  assert.equal(lineStarting(text, "never used"), "never used: none");
  assert.equal(lineStarting(text, "all ranges: blasts"), "all ranges: blasts 3, hits 2, hit rate 67%, damage 2000");
  assert.equal(lineStarting(text, "all ranges: torpedoes"), "all ranges: torpedoes 1, hits 1, hit rate 100%");
  assert.equal(lineStarting(text, "sectors cleared"), "sectors cleared | 2 | 3 | 0 | 1 | 0.7 | 1");
  assert.equal(lineStarting(text, "No clear path toward"), "No clear path toward (N, N) | 2");
  assert.equal(lineStarting(text, "after either"), "after either | 2 | 67%");
  assert.equal(lineStarting(text, "ended: 2"), "ended: 2 | still open: 1");
  assert.equal(lineStarting(text, "ended: stardates"), "ended: stardates | 2 | 1.06.5 | 1.73.0 | 1.73.0 | 2.39.5");
  assert.equal(lineStarting(text, "ship_destroyed: hull before the last command"), "ship_destroyed: hull before the last command | 1 | 400 | 400 | 400 | 400");
  assert.equal(lineStarting(text, "gap between commands"), "gap between commands | 17 | 5s | 10s | 34s | 6m 50s");
  assert.equal(lineStarting(text, "the same without long pauses"), "the same without long pauses | 3 | 20s | 50s | 53s | 1m 30s");
  assert.equal(lineStarting(text, "long pauses"), "long pauses (a gap of 5m 00s or more): 1");
  assert.equal(lineStarting(text, "returning"), "returning (games on more than one UTC day) | 1");
  assert.equal(lineStarting(text, "claude-code 2.0"), "claude-code 2.0 | 1");
});

test("a period leaves out the games started before it, and the report says what it left out for want of a game record", () => {
  const orphan = event("no-such-game", 0, "state", DAY_2 + 50, {});

  const text = report({ games: GAMES, events: [...EVENTS, orphan] }, { source: "the test's records", period: "games started in the last 1 day", since: DAY_2 });

  assert.deepEqual(text.split("\n").slice(2, 5), [
    "  period: games started in the last 1 day",
    "  1 game, 3 tool calls; rules version: 1",
    "  left out: 1 event with no game record",
  ]);
  assert.equal(lineStarting(text, "2026-11-17"), "2026-11-17 | 1");
  assert.ok(!text.includes("2026-11-16"));
});

test("with games under more than one rules version, every section is printed once per version", () => {
  const newer = game("N", { rules_version: 2, started_unix_seconds: DAY_1 });
  const newerEvents = [event("N", 0, "dock", DAY_1 + 5, { ticks: 5 })];

  const text = report({ games: [...GAMES, newer], events: [...EVENTS, ...newerEvents] }, ALL_TIME);

  const [head, first, second] = text.split("=== Rules version ");
  assert.ok(head.includes("4 games, 20 tool calls; rules versions: 1, 2"));
  assert.ok(first.startsWith("1: 3 games ===\n\nTool calls\n"));
  assert.equal(first.trimEnd(), `1: 3 games ===\n\n${report({ games: GAMES, events: EVENTS }, ALL_TIME).split("\n\n").slice(1).join("\n\n").trimEnd()}`);
  assert.ok(second.startsWith("2: 1 game ===\n\nTool calls\n"));
  assert.equal(lineStarting(second, "dock "), "dock | 1 | 1 | 0");
  assert.equal(text.split("Games per MCP client").length, 3);
});

test("with no games in the period the report says so and prints no table", () => {
  const text = report({ games: [], events: [] }, ALL_TIME);

  assert.equal(text, "Starreach telemetry report\n  source: the test's records\n  period: all time\n  0 games, 0 tool calls; rules versions: none\n\nNo games recorded.\n");
});

// The telemetry report as plain text (ONTOLOGY "Telemetry report", D-54): the figures of
// figures.ts laid out as tables, in the report's fixed order of sections, once per rules version
// when the play holds more than one.

import { STARTICKS_PER_STARDATE } from "../../app/src/telemetry.ts";

import { byRulesVersion, figures, inPeriod, LONG_PAUSE_SECONDS, type Figures, type GameLength, type Play, type Summary } from "./figures.ts";

/** What a report says of itself above its tables. */
export interface Heading {
  /** Where the records came from, in words. */
  source: string;
  /** The period in words: "all time" or "the last 7 days". */
  period: string;
  /** The start of the period, in Unix seconds: a game belongs if it started at or after it. */
  since: number;
}

/** A length of game time the way the game prints one (the Stardate display rule): `d.dd.d`,
 *  whole stardates then thousandths, truncated. */
export function formatDuration(starticks: number): string {
  const whole = Math.floor(starticks / STARTICKS_PER_STARDATE);
  const thousandths = Math.floor(((starticks % STARTICKS_PER_STARDATE) * 1000) / STARTICKS_PER_STARDATE);
  return `${whole}.${String(Math.floor(thousandths / 10)).padStart(2, "0")}.${thousandths % 10}`;
}

/** A length of real time: `45s`, `2m 05s`, `1h 02m 03s`. */
export function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds);
  const two = (part: number) => String(part).padStart(2, "0");
  if (whole < 60) {
    return `${whole}s`;
  }
  if (whole < 3600) {
    return `${Math.floor(whole / 60)}m ${two(whole % 60)}s`;
  }
  return `${Math.floor(whole / 3600)}h ${two(Math.floor((whole % 3600) / 60))}m ${two(whole % 60)}s`;
}

/** A count or an average: whole numbers bare, others to one decimal. */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A share as a whole percentage, `-` of nothing. */
export function formatShare(part: number, whole: number): string {
  return whole === 0 ? "-" : `${Math.round((100 * part) / whole)}%`;
}

type Cell = string | number;

/** A table: the first column left-aligned, the others right-aligned, `(none)` without rows. */
export function table(headers: string[], rows: Cell[][]): string {
  if (rows.length === 0) {
    return "  (none)";
  }
  const cells = [headers, ...rows.map((row) => row.map(String))];
  const widths = headers.map((_, column) => Math.max(...cells.map((row) => row[column].length)));
  const line = (row: string[]) => "  " + row.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join("  ").trimEnd();
  return cells.map(line).join("\n");
}

const SUMMARY_HEADERS = ["n", "min", "median", "mean", "max"];

/** A summary as cells under SUMMARY_HEADERS, each value printed by `print`; `-` with no numbers. */
function summaryCells(summary: Summary, print: (value: number) => string): Cell[] {
  if (summary.count === 0) {
    return [0, "-", "-", "-", "-"];
  }
  return [summary.count, print(summary.min), print(summary.median), print(summary.mean), print(summary.max)];
}

function section(title: string, ...parts: string[]): string {
  return [title, ...parts].join("\n");
}

function toolCallsSection({ toolCalls }: Figures): string {
  const rows = toolCalls.used.map((row) => [row.tool, row.calls, row.accepted, row.refused]);
  const neverUsed = toolCalls.neverUsed.length === 0 ? "none" : toolCalls.neverUsed.join(", ");
  return section("Tool calls", table(["tool", "calls", "accepted", "refused"], rows), `  never used: ${neverUsed}`);
}

function actionsSection({ subwarp, warp, blast, torpedo }: Figures): string {
  const shots = sumOf(blast.map((row) => row.shots));
  const hits = sumOf(blast.map((row) => row.hits));
  const fired = sumOf(torpedo.map((row) => row.shots));
  const struck = sumOf(torpedo.map((row) => row.hits));
  return [
    section("Subwarp: cells moved", table(["cells", "moves"], subwarp.map((row) => [row.distance, row.count]))),
    section(
      "Warp: distance in sectors (to the nearest whole) and energy cost",
      table(["sectors", "warps", "min cost", "median cost", "mean cost", "max cost"], warp.map((row) => [row.distance, ...summaryCells(row.energyCost, formatNumber)])),
    ),
    section(
      "Blast: range in cells (to the nearest whole), hit rate and damage",
      table(["range", "blasts", "hits", "hit rate", "damage"], blast.map((row) => [row.range, row.shots, row.hits, formatShare(row.hits, row.shots), row.damage])),
      `  all ranges: blasts ${shots}, hits ${hits}, hit rate ${formatShare(hits, shots)}, damage ${sumOf(blast.map((row) => row.damage))}`,
    ),
    section(
      "Torpedo: range in cells (to the nearest whole) and hit rate",
      table(["range", "torpedoes", "hits", "hit rate"], torpedo.map((row) => [row.range, row.shots, row.hits, formatShare(row.hits, row.shots)])),
      `  all ranges: torpedoes ${fired}, hits ${struck}, hit rate ${formatShare(struck, fired)}`,
    ),
  ].join("\n\n");
}

function sumOf(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function perGameSection({ perGame }: Figures): string {
  const rows = [
    ["sectors cleared", perGame.sectorsCleared.total, ...summaryCells(perGame.sectorsCleared, formatNumber)],
    ["sectors revealed", perGame.sectorsRevealed.total, ...summaryCells(perGame.sectorsRevealed, formatNumber)],
    ["dockings", perGame.dockings.total, ...summaryCells(perGame.dockings, formatNumber)],
  ];
  return section("Per game", table(["", "total", ...SUMMARY_HEADERS.map((header) => (header === "n" ? "games" : header))], rows));
}

function refusalsSection({ refusals }: Figures): string {
  return section("Refusals (a number in a reason shows as N)", table(["reason", "count"], refusals.map((row) => [row.reason, row.count])));
}

function lookingSection({ looking }: Figures): string {
  const row = (label: string, count: number) => [label, count, formatShare(count, looking.warps)];
  return section(
    "Looking before leaping: accepted warps, by what the captain looked at since the warp before",
    table(
      ["", "warps", "share"],
      [row("all warps", looking.warps), row("after a long range scan", looking.afterScan), row("after a galaxy map", looking.afterMap), row("after either", looking.afterEither), row("after neither", looking.afterNeither)],
    ),
  );
}

function lengthRows(label: string, length: GameLength): Cell[][] {
  return [
    [`${label}: commands`, ...summaryCells(length.commands, formatNumber)],
    [`${label}: stardates`, ...summaryCells(length.starticks, (ticks) => formatDuration(Math.round(ticks)))],
  ];
}

function gamesSection({ games }: Figures): string {
  const ended = sumOf(games.endings.map((row) => row.games));
  return [
    section("Games started per day (UTC)", table(["day", "games"], games.startedPerDay.map((row) => [row.day, row.games]))),
    section(
      "Games ended, by outcome and what ended them",
      table(["outcome", "ended by", "games"], games.endings.map((row) => [row.outcome, row.endedBy, row.games])),
      `  ended: ${ended}    still open: ${games.open}`,
    ),
    section(
      "Game length (stardates as d.dd.d; an ended game's length is up to the command that ended it)",
      table(["", "games", ...SUMMARY_HEADERS.slice(1)], [...lengthRows("ended", games.ended), ...lengthRows("still open", games.stillOpen)]),
    ),
    section("Goals met per ended game", table(["goals met", "games"], games.goalsMet.map((row) => [row.met, row.games]))),
  ].join("\n\n");
}

function energySection({ energy }: Figures): string {
  const endings = energy.badEndings.flatMap((ending) => [
    [`${ending.endedBy}: energy before the last command`, ...summaryCells(ending.energyBefore, formatNumber)],
    [`${ending.endedBy}: hull before the last command`, ...summaryCells(ending.hullBefore, formatNumber)],
    [`${ending.endedBy}: energy at the end`, ...summaryCells(ending.energyAtEnd, formatNumber)],
    [`${ending.endedBy}: hull at the end`, ...summaryCells(ending.hullAtEnd, formatNumber)],
  ]);
  const headers = ["", "games", ...SUMMARY_HEADERS.slice(1)];
  return [
    section("Energy: the lowest a game's energy ran", table(headers, [["lowest energy in a game", ...summaryCells(energy.lowest, formatNumber)]])),
    section("Games that ended badly: energy and hull", table(headers, endings)),
  ].join("\n\n");
}

function wallClockSection({ wallClock }: Figures): string {
  const rows = [
    ["gap between commands", ...summaryCells(wallClock.gaps, formatSeconds)],
    ["real length of a game", ...summaryCells(wallClock.realLength, formatSeconds)],
    ["the same without long pauses", ...summaryCells(wallClock.activeLength, formatSeconds)],
  ];
  return section(
    "Wall-clock (real time, from event times)",
    table(["", ...SUMMARY_HEADERS], rows),
    `  long pauses (a gap of ${formatSeconds(LONG_PAUSE_SECONDS)} or more): ${wallClock.longPauses}`,
  );
}

function playersSection({ players }: Figures): string {
  return [
    section(
      "Players, by anonymous hash",
      table(
        ["", "players"],
        [["distinct", players.distinct], ["with more than one game", players.severalGames], ["returning (games on more than one UTC day)", players.returning]],
      ),
    ),
    section("Games per MCP client", table(["client", "games"], players.clients.map((row) => [row.client, row.games]))),
  ].join("\n\n");
}

/** The sections, in the report's order. */
const SECTIONS: ((figures: Figures) => string)[] = [
  toolCallsSection,
  actionsSection,
  perGameSection,
  refusalsSection,
  lookingSection,
  gamesSection,
  energySection,
  wallClockSection,
  playersSection,
];

function sections(play: Play): string {
  const computed = figures(play);
  return SECTIONS.map((render) => render(computed)).join("\n\n");
}

function plural(count: number, one: string): string {
  return `${count} ${one}${count === 1 ? "" : "s"}`;
}

/** The whole report for the records a source gave. Every section is printed once per rules
 *  version when the games in the period were played under more than one. */
export function report(loaded: Play, heading: Heading): string {
  const { play, orphanEvents } = inPeriod(loaded, heading.since);
  const versions = byRulesVersion(play);
  const head = [
    "Starreach telemetry report",
    `  source: ${heading.source}`,
    `  period: ${heading.period}`,
    `  ${plural(play.games.length, "game")}, ${plural(play.events.length, "tool call")}; rules version${versions.length === 1 ? "" : "s"}: ${versions.length === 0 ? "none" : versions.map((each) => each.rulesVersion).join(", ")}`,
    ...(orphanEvents === 0 ? [] : [`  left out: ${plural(orphanEvents, "event")} with no game record`]),
  ].join("\n");
  if (versions.length === 0) {
    return `${head}\n\nNo games recorded.\n`;
  }
  if (versions.length === 1) {
    return `${head}\n\n${sections(play)}\n`;
  }
  const perVersion = versions.map((each) => `=== Rules version ${each.rulesVersion}: ${plural(each.play.games.length, "game")} ===\n\n${sections(each.play)}`);
  return `${head}\n\n${perVersion.join("\n\n")}\n`;
}

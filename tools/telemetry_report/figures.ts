// The telemetry report's sums (ONTOLOGY "Telemetry report", D-54): every figure the report
// prints, worked out from game records and event records alone. Nothing here knows where the
// records came from or how a figure is printed.

import type { EventRecord, GameRecord } from "../../app/src/telemetry.ts";

/** The records a report is made from. */
export interface Play {
  games: GameRecord[];
  events: EventRecord[];
}

/** The tools that leave an event: one per core command. A test holds it to the MCP server's tools. */
export const GAME_TOOLS = ["state", "galaxy_map", "galaxy_warp", "subwarp", "dock", "long_range_scan", "blast", "torpedo"];

/** A gap between two commands this long or longer is a long pause: the captain went away. */
export const LONG_PAUSE_SECONDS = 300;

export const SECONDS_PER_DAY = 86_400;

/** How a set of numbers lies. With no numbers, `count` is 0 and the other fields are 0 and mean nothing. */
export interface Summary {
  count: number;
  total: number;
  min: number;
  median: number;
  mean: number;
  max: number;
}

export interface ToolCalls {
  tool: string;
  calls: number;
  accepted: number;
  refused: number;
}

export interface DistanceRow {
  distance: number;
  count: number;
}

export interface WarpRow {
  /** Sectors, to the nearest whole. */
  distance: number;
  energyCost: Summary;
}

export interface ShotRow {
  /** Cells, to the nearest whole. */
  range: number;
  shots: number;
  hits: number;
}

export interface BlastRow extends ShotRow {
  damage: number;
}

export interface Looking {
  warps: number;
  afterScan: number;
  afterMap: number;
  afterEither: number;
  afterNeither: number;
}

export interface GameLength {
  commands: Summary;
  starticks: Summary;
}

export interface BadEnding {
  endedBy: string;
  games: number;
  /** The ship after the command before the one that ended the game. */
  energyBefore: Summary;
  hullBefore: Summary;
  /** The ship after the command that ended the game. */
  energyAtEnd: Summary;
  hullAtEnd: Summary;
}

export interface Figures {
  toolCalls: { used: ToolCalls[]; neverUsed: string[] };
  subwarp: DistanceRow[];
  warp: WarpRow[];
  blast: BlastRow[];
  torpedo: ShotRow[];
  perGame: { sectorsCleared: Summary; sectorsRevealed: Summary; dockings: Summary };
  refusals: { reason: string; count: number }[];
  looking: Looking;
  games: {
    startedPerDay: { day: string; games: number }[];
    endings: { outcome: string; endedBy: string; games: number }[];
    open: number;
    ended: GameLength;
    stillOpen: GameLength;
    goalsMet: { met: number; games: number }[];
  };
  energy: { lowest: Summary; badEndings: BadEnding[] };
  wallClock: { gaps: Summary; longPauses: number; realLength: Summary; activeLength: Summary };
  players: { distinct: number; severalGames: number; returning: number; clients: { client: string; games: number }[] };
}

export function summarize(values: number[]): Summary {
  if (values.length === 0) {
    return { count: 0, total: 0, min: 0, median: 0, mean: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const total = sum(sorted);
  return {
    count: sorted.length,
    total,
    min: sorted[0],
    median: sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    mean: total / sorted.length,
    max: sorted[sorted.length - 1],
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [item]);
    } else {
      group.push(item);
    }
  }
  return groups;
}

/** Groups as [key, items] pairs, the largest group first and equal ones by key. */
function largestFirst<T>(groups: Map<string, T[]>): [string, T[]][] {
  return [...groups].sort(([a, as], [b, bs]) => bs.length - as.length || a.localeCompare(b));
}

/** Groups as [key, items] pairs in rising order of a numeric key. */
function rising<T>(groups: Map<number, T[]>): [number, T[]][] {
  return [...groups].sort(([a], [b]) => a - b);
}

/** The UTC day of a time, as `yyyy-mm-dd`. */
function utcDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/** One game's record with its events in `seq` order. `played` are the events up to the command
 *  that ended the game, which is the last one that took time: a call after the end is a query or
 *  a refusal. For a game still open, `played` is every event. */
interface GamePlay {
  game: GameRecord;
  events: EventRecord[];
  played: EventRecord[];
}

function gamePlays(play: Play): GamePlay[] {
  const eventsByGame = groupBy(play.events, (event) => event.game_key);
  return play.games.map((game) => {
    const events = [...(eventsByGame.get(game.game_key) ?? [])].sort((a, b) => a.seq - b.seq);
    const ending = events.findLastIndex((event) => event.ticks > 0);
    return { game, events, played: game.end === null ? events : events.slice(0, ending + 1) };
  });
}

function acceptedCalls(events: EventRecord[], tool: string): EventRecord[] {
  return events.filter((event) => event.accepted && event.tool === tool);
}

function toolCalls(events: EventRecord[]): Figures["toolCalls"] {
  const used = largestFirst(groupBy(events, (event) => event.tool)).map(([tool, calls]) => {
    const accepted = calls.filter((call) => call.accepted).length;
    return { tool, calls: calls.length, accepted, refused: calls.length - accepted };
  });
  const usedTools = new Set(used.map((row) => row.tool));
  return { used, neverUsed: GAME_TOOLS.filter((tool) => !usedTools.has(tool)) };
}

function subwarpDistances(events: EventRecord[]): DistanceRow[] {
  const byDistance = groupBy(acceptedCalls(events, "subwarp"), (event) => event.detail.distance as number);
  return rising(byDistance).map(([distance, moves]) => ({ distance, count: moves.length }));
}

function warpDistances(events: EventRecord[]): WarpRow[] {
  const byDistance = groupBy(acceptedCalls(events, "galaxy_warp"), (event) => Math.round(event.detail.distance as number));
  return rising(byDistance).map(([distance, warps]) => ({
    distance,
    energyCost: summarize(warps.map((warp) => warp.detail.energy_cost as number)),
  }));
}

/** A weapon's accepted shots by range, each with what `more` adds to the row. */
function shotsByRange<More>(events: EventRecord[], tool: string, more: (shots: EventRecord[]) => More): (ShotRow & More)[] {
  const byRange = groupBy(acceptedCalls(events, tool), (event) => Math.round(event.detail.range as number));
  return rising(byRange).map(([range, shots]) => ({
    range,
    shots: shots.length,
    hits: shots.filter((shot) => shot.detail.hit).length,
    ...more(shots),
  }));
}

function perGame(plays: GamePlay[]): Figures["perGame"] {
  return {
    sectorsCleared: summarize(plays.map(({ played }) => sum(played.map((event) => event.sectors_cleared)))),
    sectorsRevealed: summarize(plays.map(({ played }) => sum(played.map((event) => event.sectors_revealed)))),
    dockings: summarize(plays.map(({ played }) => acceptedCalls(played, "dock").length)),
  };
}

/** A refusal's reason with its numbers taken out, so refusals of one kind count together:
 *  "No clear path toward (3, 4)" and "… (5, 6)" are both "No clear path toward (N, N)". */
export function reasonKind(refusal: string): string {
  return refusal.replaceAll(/\d+(\.\d+)?/g, "N");
}

function refusals(events: EventRecord[]): Figures["refusals"] {
  const refused = events.filter((event) => !event.accepted);
  return largestFirst(groupBy(refused, (event) => reasonKind(event.refusal!))).map(([reason, calls]) => ({ reason, count: calls.length }));
}

/** For each accepted warp, whether an accepted scan or galaxy map came since the warp before it
 *  (or since the game's start). */
function looking(plays: GamePlay[]): Looking {
  const tally: Looking = { warps: 0, afterScan: 0, afterMap: 0, afterEither: 0, afterNeither: 0 };
  for (const { events } of plays) {
    let scanned = false;
    let mapped = false;
    for (const event of events.filter((each) => each.accepted)) {
      scanned ||= event.tool === "long_range_scan";
      mapped ||= event.tool === "galaxy_map";
      if (event.tool !== "galaxy_warp") {
        continue;
      }
      tally.warps += 1;
      tally.afterScan += Number(scanned);
      tally.afterMap += Number(mapped);
      tally.afterEither += Number(scanned || mapped);
      tally.afterNeither += Number(!scanned && !mapped);
      scanned = false;
      mapped = false;
    }
  }
  return tally;
}

function gameLength(plays: GamePlay[]): GameLength {
  return {
    commands: summarize(plays.map(({ played }) => played.length)),
    starticks: summarize(plays.map(({ played }) => sum(played.map((event) => event.ticks)))),
  };
}

/** How many ended games met 0, 1, … of their goals, up to the most goals a game had. */
function goalsMet(ended: GamePlay[]): Figures["games"]["goalsMet"] {
  const metCounts = ended.map(({ game }) => game.end!.goals.filter((goal) => goal.met).length);
  const mostGoals = Math.max(-1, ...ended.map(({ game }) => game.end!.goals.length));
  return Array.from({ length: mostGoals + 1 }, (_, met) => ({ met, games: metCounts.filter((count) => count === met).length }));
}

function games(plays: GamePlay[]): Figures["games"] {
  const ended = plays.filter(({ game }) => game.end !== null);
  const open = plays.filter(({ game }) => game.end === null);
  const byDay = groupBy(plays, ({ game }) => utcDay(game.started_unix_seconds));
  const byEnding = groupBy(ended, ({ game }) => `${game.end!.outcome} ${game.end!.ended_by}`);
  return {
    startedPerDay: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, started]) => ({ day, games: started.length })),
    endings: largestFirst(byEnding).map(([, same]) => ({ outcome: same[0].game.end!.outcome, endedBy: same[0].game.end!.ended_by, games: same.length })),
    open: open.length,
    ended: gameLength(ended),
    stillOpen: gameLength(open),
    goalsMet: goalsMet(ended),
  };
}

function badEnding(endedBy: string, lost: GamePlay[]): BadEnding {
  const last = lost.filter(({ played }) => played.length >= 1).map(({ played }) => played[played.length - 1]);
  const before = lost.filter(({ played }) => played.length >= 2).map(({ played }) => played[played.length - 2]);
  return {
    endedBy,
    games: lost.length,
    energyBefore: summarize(before.map((event) => event.energy)),
    hullBefore: summarize(before.map((event) => event.hull)),
    energyAtEnd: summarize(last.map((event) => event.energy)),
    hullAtEnd: summarize(last.map((event) => event.hull)),
  };
}

function energy(plays: GamePlay[]): Figures["energy"] {
  const withEvents = plays.filter(({ played }) => played.length > 0);
  const lost = plays.filter(({ game }) => game.end !== null && game.end.outcome === "lost");
  return {
    lowest: summarize(withEvents.map(({ played }) => Math.min(...played.map((event) => event.energy)))),
    badEndings: largestFirst(groupBy(lost, ({ game }) => game.end!.ended_by)).map(([endedBy, same]) => badEnding(endedBy, same)),
  };
}

/** The real seconds between a game's consecutive commands, `new_game` being the first. */
function gapsOf({ game, played }: GamePlay): number[] {
  const times = [game.started_unix_seconds, ...played.map((event) => event.unix_seconds)];
  return times.slice(1).map((time, index) => time - times[index]);
}

function wallClock(plays: GamePlay[]): Figures["wallClock"] {
  const gapsPerGame = plays.filter(({ played }) => played.length > 0).map(gapsOf);
  const gaps = gapsPerGame.flat();
  return {
    gaps: summarize(gaps),
    longPauses: gaps.filter((gap) => gap >= LONG_PAUSE_SECONDS).length,
    realLength: summarize(gapsPerGame.map(sum)),
    activeLength: summarize(gapsPerGame.map((own) => sum(own.filter((gap) => gap < LONG_PAUSE_SECONDS)))),
  };
}

/** What a game record tells of its MCP client, as one label: the declared name and version where
 *  the server saw them, else the User-Agent, else "unknown". */
export function clientLabel({ client }: GameRecord): string {
  if (client.name !== null) {
    return client.version === null ? client.name : `${client.name} ${client.version}`;
  }
  return client.user_agent === null ? "unknown" : client.user_agent;
}

function players(gameRecords: GameRecord[]): Figures["players"] {
  const byPlayer = [...groupBy(gameRecords, (game) => game.player_hash).values()];
  const daysPlayed = (own: GameRecord[]) => new Set(own.map((game) => utcDay(game.started_unix_seconds))).size;
  return {
    distinct: byPlayer.length,
    severalGames: byPlayer.filter((own) => own.length > 1).length,
    returning: byPlayer.filter((own) => daysPlayed(own) > 1).length,
    clients: largestFirst(groupBy(gameRecords, clientLabel)).map(([client, same]) => ({ client, games: same.length })),
  };
}

/** Every figure of the report, for the games given and their events. An event whose game is not
 *  among `play.games` is counted nowhere. */
export function figures(play: Play): Figures {
  const plays = gamePlays(play);
  const events = plays.flatMap((each) => each.events);
  return {
    toolCalls: toolCalls(events),
    subwarp: subwarpDistances(events),
    warp: warpDistances(events),
    blast: shotsByRange(events, "blast", (shots) => ({ damage: sum(shots.map((shot) => shot.detail.damage as number)) })),
    torpedo: shotsByRange(events, "torpedo", () => ({})),
    perGame: perGame(plays),
    refusals: refusals(events),
    looking: looking(plays),
    games: games(plays),
    energy: energy(plays),
    wallClock: wallClock(plays),
    players: players(play.games),
  };
}

/** The part of the play a report covers: the games started at or after `since`, with their
 *  events, and how many events were left out because no game record is theirs. */
export function inPeriod(play: Play, since: number): { play: Play; orphanEvents: number } {
  const known = new Set(play.games.map((game) => game.game_key));
  const games = play.games.filter((game) => game.started_unix_seconds >= since);
  const kept = new Set(games.map((game) => game.game_key));
  return {
    play: { games, events: play.events.filter((event) => kept.has(event.game_key)) },
    orphanEvents: play.events.filter((event) => !known.has(event.game_key)).length,
  };
}

/** The play split by rules version, lowest first. */
export function byRulesVersion(play: Play): { rulesVersion: number; play: Play }[] {
  return rising(groupBy(play.games, (game) => game.rules_version)).map(([rulesVersion, games]) => {
    const keys = new Set(games.map((game) => game.game_key));
    return { rulesVersion, play: { games, events: play.events.filter((event) => keys.has(event.game_key)) } };
  });
}

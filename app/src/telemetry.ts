// Telemetry (ONTOLOGY "Telemetry", D-51): what captains actually do, for tuning. One game record
// per new_game, completed when the game ends, and one event record per tool call on a game. The
// app layer makes the records from Results it already holds and hands them to a sink; the core
// knows nothing of it. No record holds a game_id, a view_id or a player id.

import type { Command, CommandResult, Core, GameJson, GoalState } from "./core.ts";
import { sha256Hex } from "./hash.ts";
import type { Totals } from "./players.ts";

/** Which rules a game was played under. Bump it by hand, by one, in the same change as any
 *  change to a rule of the core or to a number of ONTOLOGY's Numbers table that play depends on,
 *  so games under different rules can be told apart. */
export const RULES_VERSION = 1;

/** Salts the player hash, so it isn't the plain hash of a player id. It is in the code, so it
 *  keeps nothing from someone who has the code; changing it starts every player's hash afresh. */
export const PLAYER_HASH_SALT = "starreach-player-hash-1";

/** The damage a blast that hits is recorded as doing. A placeholder: a blast kills or does
 *  nothing, so there is no amount to measure until blasts do graded damage. */
export const BLAST_HIT_DAMAGE = 1000;

/** Sets a telemetry game key apart from the view_id, which is the bare hash of the game_id. */
const GAME_KEY_DOMAIN = "starreach-telemetry-game-1";

/** The core's STARTICKS_PER_STARDATE, which a stardate is read back into starticks by. */
const STARTICKS_PER_STARDATE = 400;

/** What the server can tell of the connecting MCP client; a part it can't tell is null. */
export interface McpClient {
  /** The name and version the client declared in MCP's `initialize`, where this server saw it. */
  name: string | null;
  version: string | null;
  /** The HTTP request's User-Agent, where the call came over HTTP. */
  user_agent: string | null;
}

/** A game record as `new_game` writes it. */
export interface GameStart {
  game_key: string;
  /** The real time the game started, as given to the core: with the seed it replays the game. */
  started_unix_seconds: number;
  seed: number;
  rules_version: number;
  player_hash: string;
  client: McpClient;
}

/** How a game ended, by the core's Game end rule. */
export type EndCause = "ship_destroyed" | "stranded" | "galaxy_cleared";

/** One of the game's goals at its end. */
export interface GoalOutcome {
  counter: string;
  amount: number;
  met: boolean;
}

/** What completes a game record when the game ends. */
export interface GameEnd {
  outcome: "won" | "lost";
  ended_by: EndCause;
  counters: Totals;
  goals: GoalOutcome[];
}

export interface GameRecord extends GameStart {
  /** Null until the game ends. */
  end: GameEnd | null;
}

/** What a tool's own Result tells beyond the fields every event has. */
export type EventDetail = Record<string, number | boolean>;

/** One tool call on a game, as the app layer hands it to the sink. */
export interface CommandEvent {
  game_key: string;
  unix_seconds: number;
  tool: string;
  /** The tool's arguments without the game_id. */
  args: Record<string, unknown>;
  accepted: boolean;
  /** The refusal's reason, null when accepted. */
  refusal: string | null;
  /** The game clock after the call, in starticks. */
  startick: number;
  /** The starticks the command took: 0 for a query or a refusal. */
  ticks: number;
  energy: number;
  shields: number;
  hull: number;
  torpedoes: number;
  /** What enemy fire took from shields and hull during the command. */
  damage_taken: number;
  sectors_revealed: number;
  sectors_cleared: number;
  detail: EventDetail;
}

export interface EventRecord extends CommandEvent {
  /** The event's place among its game's events, from 0, as the sink received them. */
  seq: number;
}

/** Where telemetry records go. The sink numbers each game's events in the order it gets them. */
export interface Telemetry {
  gameStarted(start: GameStart): Promise<void>;
  gameEnded(gameKey: string, end: GameEnd): Promise<void>;
  commandRun(event: CommandEvent): Promise<void>;
}

/** What recording needs beside the record's own facts. */
export interface Recorder {
  core: Core;
  telemetry: Telemetry;
  /** The real clock, in Unix seconds. */
  unixSeconds: () => number;
}

/** Telemetry in process memory, gone when the process ends. */
export class MemoryTelemetry implements Telemetry {
  private readonly gameRecords = new Map<string, GameRecord>();
  private readonly eventRecords: EventRecord[] = [];

  async gameStarted(start: GameStart): Promise<void> {
    this.gameRecords.set(start.game_key, { ...start, end: null });
  }

  async gameEnded(gameKey: string, end: GameEnd): Promise<void> {
    const record = this.gameRecords.get(gameKey);
    if (record === undefined) {
      throw new Error("No game record to complete");
    }
    this.gameRecords.set(gameKey, { ...record, end });
  }

  async commandRun(event: CommandEvent): Promise<void> {
    this.eventRecords.push({ ...event, seq: this.eventsOf(event.game_key).length });
  }

  /** Every game record, in the order the games started. */
  games(): GameRecord[] {
    return [...this.gameRecords.values()];
  }

  /** Every event record, in the order received. */
  events(): EventRecord[] {
    return [...this.eventRecords];
  }

  /** One game's events, in `seq` order. */
  eventsOf(gameKey: string): EventRecord[] {
    return this.eventRecords.filter((event) => event.game_key === gameKey);
  }
}

/** The key a game's telemetry records share. It is a hash of the game_id under its own domain,
 *  so it is neither the game_id nor the view_id, and neither can be worked out from it. */
export function telemetryGameKey(gameId: string): Promise<string> {
  return sha256Hex(`${GAME_KEY_DOMAIN}:${gameId}`);
}

/** A player's salted one-way hash: the same for the same player, and never the player id. */
export function playerHash(player: string): Promise<string> {
  return sha256Hex(`${PLAYER_HASH_SALT}:${player}`);
}

/** Writes the record of a game that `player` just started. A failure is logged and goes no further. */
export function recordGameStart(recorder: Recorder, gameId: string, seed: number, startedUnixSeconds: number, player: string, client: McpClient): Promise<void> {
  return guarded(async () => {
    const start: GameStart = {
      game_key: await telemetryGameKey(gameId),
      started_unix_seconds: startedUnixSeconds,
      seed,
      rules_version: RULES_VERSION,
      player_hash: await playerHash(player),
      client,
    };
    await recorder.telemetry.gameStarted(start);
  });
}

/** Writes the event of one command on a game, and completes the game's record when that command
 *  ended the game. `before` is the game the command ran on and `applied` what the core returned.
 *  A failure is logged and goes no further. */
export function recordCommand(recorder: Recorder, gameId: string, command: Command, before: GameJson, applied: { game: GameJson; result: CommandResult }): Promise<void> {
  return guarded(async () => {
    const { core, telemetry } = recorder;
    const gameKey = await telemetryGameKey(gameId);
    const was = reading(stateOf(core, before));
    const now = reading(applied.result.state!);
    const { type, ...args } = command;
    const event: CommandEvent = {
      game_key: gameKey,
      unix_seconds: recorder.unixSeconds(),
      tool: type,
      args,
      accepted: applied.result.ok,
      refusal: applied.result.error,
      startick: now.startick,
      ticks: now.startick - was.startick,
      energy: now.energy,
      shields: now.shields,
      hull: now.hull,
      torpedoes: now.torpedoes,
      damage_taken: damageTaken(was, now),
      sectors_revealed: sectorsVisible(core, applied.game) - sectorsVisible(core, before),
      sectors_cleared: now.counters.sectors_cleared - was.counters.sectors_cleared,
      detail: detailOf(type, was, now, applied.result),
    };
    await telemetry.commandRun(event);
    if (was.status === "playing" && now.status !== "playing") {
      await telemetry.gameEnded(gameKey, gameEnd(now));
    }
  });
}

/** A sink that fails must not fail the player's command. */
async function guarded(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error(`Telemetry not recorded: ${(error as Error).message}`);
  }
}

/** What telemetry reads of a GameState. */
interface Reading {
  status: string;
  startick: number;
  energy: number;
  shields: number;
  hull: number;
  torpedoes: number;
  sectorXy: [number, number];
  shipXy: [number, number];
  counters: Totals;
  goals: GoalState[];
}

function reading(state: Record<string, unknown>): Reading {
  return {
    status: state.status as string,
    startick: starticks(state.stardate as string),
    energy: state.ship_energy as number,
    shields: state.ship_shields as number,
    hull: state.ship_hull as number,
    torpedoes: state.ship_quantorpedoes as number,
    sectorXy: state.sector_xy as [number, number],
    shipXy: state.ship_xy as [number, number],
    counters: state.counters as Totals,
    goals: state.goals as GoalState[],
  };
}

function stateOf(core: Core, game: GameJson): Record<string, unknown> {
  const answer = core.apply(game, { type: "state" });
  if (answer === undefined) {
    throw new Error("The core can't read the game the command ran on");
  }
  return answer.result.state!;
}

/** A stardate, `ddd.dddd.dd.d`, back in starticks. The display truncates a startick to
 *  thousandths of a stardate, so the thousandths round up to the startick they came from. */
export function starticks(stardate: string): number {
  const thousandths = Number(stardate.replaceAll(".", ""));
  const whole = Math.floor(thousandths / 1000);
  return whole * STARTICKS_PER_STARDATE + Math.ceil(((thousandths % 1000) * STARTICKS_PER_STARDATE) / 1000);
}

function damageTaken(was: Reading, now: Reading): number {
  return now.counters.shield_damage - was.counters.shield_damage + now.counters.hull_damage - was.counters.hull_damage;
}

/** How many sectors of a game's galaxy are visible. */
function sectorsVisible(core: Core, game: GameJson): number {
  const view = core.view(game);
  if (view === undefined) {
    throw new Error("The core can't view the game");
  }
  return view.galaxy.flat().filter((sector) => sector !== null).length;
}

/** Straight-line distance between two coordinates, to two decimals as the core gives ranges. */
function distance([ax, ay]: [number, number], [bx, by]: [number, number]): number {
  return Math.round(Math.hypot(ax - bx, ay - by) * 100) / 100;
}

type Detail = (was: Reading, now: Reading, report: Record<string, unknown>) => EventDetail;

/** What each tool's Result tells beyond the common fields, by tool. A tool that isn't here tells
 *  nothing more. A warp's shield recharge is the shields' rise plus what enemy fire took from
 *  them on the way, since nothing else moves the shields during a warp. */
const DETAILS: Record<string, Detail> = {
  subwarp: (_was, _now, report) => ({
    distance: (report.path as unknown[]).length - 1,
    energy_cost: report.energy_cost as number,
  }),
  galaxy_warp: (was, now, report) => ({
    distance: distance(was.sectorXy, now.sectorXy),
    energy_cost: report.energy_cost as number,
    shield_recharge: now.shields - was.shields + now.counters.shield_damage - was.counters.shield_damage,
  }),
  blast: (was, _now, report) => ({
    range: distance(was.shipXy, report.hit_xy as [number, number]),
    hit: report.destroyed as boolean,
    energy_cost: report.energy_cost as number,
    damage: (report.destroyed as boolean) ? BLAST_HIT_DAMAGE : 0,
  }),
  torpedo: (was, _now, report) => ({
    range: distance(was.shipXy, report.hit_xy as [number, number]),
    hit: report.destroyed as boolean,
  }),
};

function detailOf(tool: string, was: Reading, now: Reading, result: CommandResult): EventDetail {
  if (!result.ok || !Object.hasOwn(DETAILS, tool)) {
    return {};
  }
  return DETAILS[tool](was, now, result.report!);
}

/** What ended a game, read from its last state: the Game end rule counts a stranding apart from
 *  the other way of losing. */
function endCause(now: Reading): EndCause {
  if (now.status === "won") {
    return "galaxy_cleared";
  }
  return now.counters.times_stranded > 0 ? "stranded" : "ship_destroyed";
}

function gameEnd(now: Reading): GameEnd {
  return {
    outcome: now.status as "won" | "lost",
    ended_by: endCause(now),
    counters: now.counters,
    goals: now.goals.map(({ counter, amount, met }) => ({ counter, amount, met })),
  };
}

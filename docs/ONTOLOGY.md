# Starreach — Ontology

The implementation reference for Starreach: what exists, what each thing carries, how
things relate, the rules that change them, and the interface to them. It states the
current design only. Reasons and open questions are in RATIONALE.md, checks are in
CRITERIA.md, history is in ARCHITECTURE_LOG.md, and why it's fun is in DYNAMICS.md.

**Tags.** **[D]** decided by the designer · **[P]** proposed by Claude, pending review ·
**[T]** tunable (see Numbers) · **[D, unbuilt]** decided but not yet in the Rust core or the app layers.
**Serves:** the goal (`G-n`), quality (`F-name`), or DYNAMICS driver an item exists for.
Stable IDs: goals `G-n`, decisions `D-n`, questions `Q-n`, criteria `R-n`/`U-n`/`X-n`.

---

## 0. Purpose [D]

Starreach is a galaxy search-and-battle game that you play **by talking to an LLM**. The
LLM plays the ship's crew and computer and acts on the game through MCP tools. A browser
page is a read-only view of the game.

### Qualities
- **F-command** — You command a crew. You give orders in natural language and they are
  answered with naval decorum. [D]
- **F-discovery** — The galaxy starts hidden and you uncover it. [D]
- **F-danger** — Enemies fight back, so position and timing matter. [D]

### Goals (priority order)
- **G-1 Playable entirely through an LLM conversation.** Every player action and every
  piece of state the player needs is an MCP tool or prompt. Results carry enough for the
  LLM to narrate. [D]
- **G-2 Search and battle across a galaxy.** Warp between sectors, maneuver within one,
  destroy enemies, resupply at starbases, and win or lose. [D]
- **G-3 The browser shows the game being played.** A read-only page shows the current sector,
  the galaxy map and ship status of the game the LLM is playing, and follows it live. [D]
- **G-4 Resources force choices.** Energy, quantorpedoes, shields and hull are finite and
  every action must be paid for. Starbases are rare. [D]

### Priorities when goals conflict
G-1 > G-2 > G-4 > G-3. [P]

### Non-goals (for now)
Multiplayer [D]. Persistence in the local Node adapter [D]. Playing through the browser [D].

---

## 1. Vocabulary [D]

One name per concept. These names are used in code, tools and docs.

| Term | Meaning | Synonyms in flavor text |
|---|---|---|
| **Galaxy** | The 10×10 grid of sectors | |
| **Sector** | One square of the galaxy, addressed `(x, y)` | quadrant |
| **Cell** | One square of a sector's 10×10 board, addressed `(x, y)` | position, space |
| **Coordinate** | `(x, y)`: column, then row, each in `0..9`. `x` counts columns from the left and `y` rows from the top (D-50) | |
| **Warp** | A move from one sector to another | galaxy warp |
| **Subwarp** | A move from cell to cell within a sector | impulse |
| **Ray** | The cells a straight move or shot passes through, up to and including the first obstacle | path, beam path |
| **Obstacle** | A cell that isn't empty or is off the board | |
| **Blast** | The ship's energy weapon | blaston beam |
| **Torpedo** | The ship's limited-ammo weapon | quantorpedo |
| **Enemy fire** | An enemy's weapon | raxxon beam |
| **Stardate** | Game time as the player reads it. A stardate is a day, shown to three decimals | |
| **Startick** | The unit the game clock counts in: a whole number, `STARTICKS_PER_STARDATE` to a stardate, so 3.6 minutes | tick |
| **Command** | A request to the core: an action or a query | order |
| **Action** | A command that changes state | |
| **Query** | A command that only reads state | |
| **Event** | Something the game does in response to an action, reported as a message | |
| **Counter** | A running count of one kind of thing that has happened in a game | |
| **Goal** | One of the `GOALS_PER_GAME` things a game asks of its captain: an amount of one counter to reach within that game | objective |
| **Lifetime total** | A player's count on one counter over all of that player's games | |
| **Ladder** | The rising amounts a counter's lifetime total is measured against; each is a **rung** | |
| **Achievement** | A lifetime total reaching a rung of its counter's ladder | commendation |
| **Player** | Whoever issues commands: the signed-in `sub`, or the one local player where there is no sign-in | captain |
| **Star Central** | Fleet command, which sends the captain messages; also the home starbase at `GALAXY_CENTER` | Fleet Command |
| **Game id** | The name a client uses for one stored game (`game_id`) | |
| **View id** | The hex SHA-256 of a `game_id` (`view_id`). It keys the GameStore and the Viewers, and is all the viewer's link and socket carry | |
| **Viewer** | A browser page watching one game over its socket | main viewer |
| **Telemetry** | The records of what captains do, kept for tuning: a game record per game and an event record per tool call on a game | |
| **Telemetry game key** | What a game's telemetry records share (`game_key`): a hash of the `game_id` that is neither the `game_id` nor the `view_id` | |
| **Player hash** | A salted one-way hash of a player id (`player_hash`), which tells one player's games from another's without naming the player | |
| **Rules version** | A whole number naming the rules and numbers a game was played under (`RULES_VERSION`) | |
| **MCP client** | The program that connects the LLM to the MCP tools, such as Claude Desktop or Claude Code | |
| **Frame** | One message on a viewer's socket, `{type, …}`. A view frame carries the GameView and the starting player's achievements | |

---

## 2. Entities

### Game (world)
*Serves: G-2.* [D] The whole state of one game. It is a plain value: the core
receives it, returns a new one, and never keeps it.

| Field | Type | Notes |
|---|---|---|
| `seed` | u32 | Chosen at creation; fixes the galaxy and every sector layout |
| `rng` | RngState | The game's random stream; every draw outside sector layout comes from it |
| `status` | `playing` \| `won` \| `lost` | |
| `galaxy` | Galaxy | |
| `ship` | Ship | |
| `sector_xy` | Coordinate | The sector the ship is in |
| `sector` | ActiveSector | The live board of `sector_xy` |
| `startick` | int | The game clock, in whole starticks [D] |
| `last_event_startick` | int | The clock when stardate events last ran, or when the ship entered the sector |
| `counters` | Counters | What has happened in this game so far [D] |
| `goals` | Goal[`GOALS_PER_GAME`] | This game's objectives, chosen from the seed at creation [D] |

The event kinds and their order are fixed by the rules, not stored.

### Ship
*Serves: G-4, F-danger.* [D] There is exactly one ship, the player's.

| Field | Type | Notes |
|---|---|---|
| `hull`, `max_hull` | int | Takes damage after shields are gone |
| `shields`, `max_shields` | int | Takes damage first |
| `energy`, `max_energy` | int | Spent by actions and by shield recharge |
| `quantorpedoes`, `max_quantorpedoes` | int | Spent by torpedoes |

The ship's cell is `ActiveSector.ship_xy`.

### Counters
*Serves: G-1, G-2.* [D] What has happened in one game: a named count per kind of thing, all 0 in
a new game. The rule where the thing happens adds to its counter, at that one place; nothing
is counted by reading event text. Every Result reports them in `GameState.counters`, so a
caller can take the difference between two Results (D-42).

This is also the **counter table**: the core holds one row per counter with its key (the field
name), its label, whether it may be a goal, its `scale` and its `goal_ceiling`, and gives it out
through the Core API's `counter_table`. It is the single source of the list for the app layer
and the displays. Positive counters may be a game's goal; negative ones never are. [D] A label
reads after a number ("12 enemies destroyed"). [P]

`scale` is the unit of the counter's ladder of lifetime totals: 1, 10, 100 or 1000. [D]
`goal_ceiling` is the most a game's goal may ask of the counter; 0 means the counter is not
offered as a goal, and every counter that may not be a goal has 0. [D; 0 for "not offered" is P]
Both are set by the rule of D-43 from modeled whole games; their values are in the Numbers table
(`COUNTER_SCALE`, `COUNTER_GOAL_CEILING`). [T]

| Field (key) | Type | Label | May be a goal | Counts, and the rule that counts it |
|---|---|---|---|---|
| `enemies_destroyed` | int | enemies destroyed | yes | Enemies removed by a blast or a torpedo (Destroy enemy) |
| `sectors_cleared` | int | sectors cleared | yes | Times the last enemy in the ship's sector was destroyed (Destroy enemy) |
| `sectors_warped` | int | sectors warped to | yes | Warps that reached their sector (Warp) |
| `docks` | int | docks at a starbase | yes | Docks accepted (Dock) |
| `starbases_discovered` | int | starbases discovered | yes | Starbases in sectors that became visible, by warp or long-range scan; Star Central's is visible from the start and never counts (Visibility) |
| `blasts_hit` | int | blasts that hit | yes | Blasts that destroyed their target (Blast) |
| `torpedoes_fired` | int | torpedoes fired | yes | Torpedoes accepted (Torpedo) |
| `scans` | int | long range scans | yes | Long-range scans accepted (Long-range scan) |
| `games_won` | int | games won | yes | 1 once the game is won (Game end) |
| `shield_damage` | int | shield damage taken | no | Points enemy fire took from the shields (EnemyFire) |
| `hull_damage` | int | hull damage taken | no | Points enemy fire took from the hull (EnemyFire) |
| `blasts_missed` | int | blasts that missed | no | Blasts that left their target untouched (Blast) |
| `games_lost` | int | games lost | no | 1 once the game is lost, however it was lost (Game end) |
| `times_stranded` | int | times stranded | no | 1 once the game is lost by the stranded rule (Game end) |

### Goal
*Serves: G-1, G-2, DYNAMICS Accumulation.* [D] One objective of one game: reach an amount on one
counter within this game. A game has `GOALS_PER_GAME` of them, each on a different counter,
chosen at creation by the Goal selection rule. A goal is measured on the game's own count, never
on a lifetime total, and meeting it earns Star Central's message and nothing else (D-47).

| Field | Type | Notes |
|---|---|---|
| `counter` | counter key | A counter that may be a goal and whose `goal_ceiling` is at least its first rung. Stored as the key; a key that names no counter doesn't parse |
| `amount` | int | A rung of the counter's ladder at or below its `goal_ceiling` |
| `met` | bool | False at creation; set by the Goal check rule, and never cleared |

A Result shows each goal as a **GoalState**: `{counter, label, count, amount, met}`, where
`label` is the counter's label and `count` is the game's count on that counter so far. `count`
keeps rising after the goal is met. [P]

### Galaxy
*Serves: G-2, F-discovery.* [D]

| Field | Type | Notes |
|---|---|---|
| `sectors` | SectorRecord[10][10] | Indexed `[y][x]` |

The starting sector is `GALAXY_CENTER` ("Star Central").

### SectorRecord
*Serves: F-discovery.* [D] What the galaxy remembers about a sector: counts, not layout.

| Field | Type | Notes |
|---|---|---|
| `visible` | bool | Whether the player may see the counts |
| `enemies` | int | Live enemies; only goes down |
| `starbases` | int | 0 or 1 |
| `stars` | int | |

### ActiveSector
*Serves: G-2, F-danger.* [D] The tactical board for the sector the ship is in. It is
built from the SectorRecord and the sector's seed when the ship arrives, and discarded
when it leaves.

| Field | Type | Notes |
|---|---|---|
| `map` | char[10][10] | `.` empty · `S` ship · `B` starbase · `E` enemy · `*` star |
| `ship_xy` | Coordinate | |
| `starbase_xy` | Coordinate \| null | |
| `enemies_xy` | Coordinate[] | One per live enemy |
| `stars` | int | Stars placed |

Live counts are derived: `enemies = len(enemies_xy)`, `starbases = (starbase_xy ≠ null)`.

### Enemy
*Serves: F-danger.* [D] An occupant of one cell. Its only property is its position (an
entry in `enemies_xy`). All enemies are alike and have no hull: a hit either destroys one or
leaves it untouched. A torpedo always destroys it; a blast does with a chance that falls with range
(Blast).

### EnemySight
*Serves: F-danger, G-4.* [D] One enemy as the ship sees it, made in the core for every
GameState from `ship_xy` and the board, so every client reads one source. Not stored.

| Field | Type | Notes |
|---|---|---|
| `xy` | Coordinate | The enemy's cell |
| `range` | float | `euclid(ship_xy, xy)` rounded to two decimals: the distance Blast checks against `BLAST_RANGE` |
| `bearing` | int | Whole degrees clockwise from up, in `0..359`: toward row 0 is 0, right 90, down 180, left 270 [D] |
| `clear_shot` | bool | `first enemy on ray(ship_xy, xy) == xy`, the ray Blast and Torpedo use. Says nothing about range: a clear shot beyond `BLAST_RANGE` is torpedo-only |

```
up = ship.y - xy.y;  right = xy.x - ship.x
bearing = round(degrees(atan2(right, up))) mod 360
```

### Starbase
*Serves: G-4, F-discovery.* [D] An occupant of one cell (`starbase_xy`). It can't be
destroyed. It is an obstacle and the only source of resupply and of hull repair
(D-7).

### Star
*Serves: F-danger.* [D] An occupant of one cell, recorded only on `map`. It is an
obstacle and can't be destroyed. A ship can't enter a star's cell.

### Event
*Serves: G-1, F-danger.* [D] One template: `can_occur(game) → bool` and
`execute(game) → message[]`. Kinds: **StarbaseHail** (warp event), **ShieldReplenish**
and **EnemiesTurn** (stardate events, in that order). EnemiesTurn is made up of
per-enemy **EnemyFire** and **EnemyAdvance**.

### GameStore
*Serves: G-1.* [D] Where the app layer keeps games between commands. The core
never sees it.

| Field | Type | Notes |
|---|---|---|
| `view_id` | str | The hex SHA-256 of the `game_id`; the store never holds a `game_id` |
| `game` | Game | Stored as the core returned it |
| `player` | str | The player who started the game: the PlayerStore's `player` that `new_game` ran for. It never changes, and it is not in the Game: the core knows no player (D-49) |

The `game_id` is random and unguessable, chosen by the app layer, and one app-layer function
hashes it to the `view_id` (D-32). The store reads and writes the game and its player together.
The player is kept only to say whose achievements the game's viewers see; no command is
checked against it. [D] The Node adapter keeps games in process memory. The
Cloudflare adapter keeps one SQLite-backed Durable Object per `view_id`, named by it. [D] The
object holds the game JSON under one key of its key-value storage and the player under another,
and a game with no player beside it is no game. [P]

### PlayerStore
*Serves: G-1.* [D] Where the app layer keeps each player's lifetime totals. The core never sees
it.

| Field | Type | Notes |
|---|---|---|
| `player` | str | The signed-in player's `sub` (D-41), or `local` where the endpoint has no sign-in |
| `totals` | counter key → int | The player's lifetime total per counter; a counter never added to is absent and stands at 0 |

Two operations: read a player's totals, and add a set of increments, which answers with the
touched counters' totals before and after. Additions to one player are applied one at a time, so
none is lost. [D] The Node adapter keeps totals in process memory, so they last as long as the
process and belong to the single local player. The Cloudflare adapter keeps one SQLite-backed
Durable Object per player, named by the player id (D-45). [D] The object holds a key per counter
in its key-value storage. [P]

An **achievement** is not stored: it is a lifetime total at or past a rung of its counter's
ladder, so a player's whole list follows from the totals and the counter table (D-44). The app
layer gives the list out as a row per counter, `{key, label, total, reached, next}`: the total,
the last rung reached (null below the first) and the next. [D] No MCP tool returns it; it goes
to the viewer, in every view frame (Viewer socket, D-49). [D]

### Telemetry
*Serves: the tuning of G-2 and G-4: it is the source of measured evidence for RATIONALE and the
X criteria.* [D] What captains actually do, recorded by the app layer from the Results it already
holds and handed to a **telemetry sink**. The core knows nothing of it, and it changes no game
and no Result. There are two kinds of record, joined by the telemetry game key. No record holds
a `game_id`, a `view_id`, a player id or any text of the conversation (D-51).

**Game record**: one per game, written by `new_game` and completed by the command that ends the
game. [D]

| Field | Type | Notes |
|---|---|---|
| `game_key` | str | The telemetry game key: hex SHA-256 of the `game_id` under telemetry's own prefix. It is not a `game_id` and not a `view_id`, and neither follows from it [D; the construction P] |
| `started_unix_seconds` | int | The real time the game started: the very number the core's `new_game` was given, so it replays the game with the seed |
| `seed` | u32 | The game's seed |
| `rules_version` | int | `RULES_VERSION` when the game started |
| `player_hash` | str | The player hash of the player `new_game` ran for (the GameStore's `player`): hex SHA-256 of `PLAYER_HASH_SALT` and the player id |
| `client` | McpClient | What the server could tell of the MCP client that called `new_game` |
| `end` | GameEnd or null | Null until the game ends |

**GameEnd**: what completes a game record. A game nobody finishes keeps `end` null; nothing
marks it abandoned. [D]

| Field | Type | Notes |
|---|---|---|
| `outcome` | `won` \| `lost` | The game's `status` |
| `ended_by` | `galaxy_cleared` \| `ship_destroyed` \| `stranded` | Which row of the Game end rule ended it, read from the last state: `won` is `galaxy_cleared`, a loss with `times_stranded` counted is `stranded`, any other loss is `ship_destroyed` [P] |
| `counters` | Counters | The game's counters at its end |
| `goals` | `{counter, amount, met}`[`GOALS_PER_GAME`] | Each of the game's goals and whether it was met [D; listing the unmet ones too is P] |

**McpClient**: what the server can truthfully tell of the connecting client on the call. A part
it can't tell is null. [D; the three fields P]

| Field | Type | Notes |
|---|---|---|
| `name`, `version` | str or null | What the client declared in MCP's `initialize`. Known on a connection that carried one: stdio. Null over HTTP, where MCP is stateless and a tool call arrives without its `initialize` |
| `user_agent` | str or null | The HTTP request's `User-Agent`. Null over stdio |

**Event record**: one per tool call on a game, accepted or refused, the queries included. [D]

| Field | Type | Notes |
|---|---|---|
| `game_key` | str | The game's telemetry game key |
| `seq` | int | The event's place among its game's events, from 0. The sink numbers them as it receives them [P] |
| `unix_seconds` | int | The adapter's clock at the call. The gap between two commands is not stored: it is the difference of consecutive events' times [D; whole seconds P] |
| `tool` | str | The command's `type` |
| `args` | object | The tool's arguments without the `game_id` |
| `accepted` | bool | The Result's `ok` |
| `refusal` | str or null | The Result's `error`: why it was refused, null when accepted |
| `startick` | int | The game clock after the call, in starticks |
| `ticks` | int | The starticks the command took; 0 for a query or a refusal |
| `energy`, `shields`, `hull`, `torpedoes` | int | The ship after the call |
| `damage_taken` | int | What enemy fire took from shields and hull during the call: the rise of `shield_damage` plus `hull_damage` |
| `sectors_revealed` | int | Sectors that became visible by the call |
| `sectors_cleared` | int | The rise of `sectors_cleared` by the call: 0 or 1 |
| `detail` | object | What the tool's own Result tells, by tool; `{}` for a refusal and for a tool with nothing more to tell |

| Tool | `detail` |
|---|---|
| `subwarp` | `{distance, energy_cost}`: cells moved, and the report's `energy_cost` |
| `galaxy_warp` | `{distance, energy_cost, shield_recharge}`: Euclidean distance in sectors to two decimals, the report's `energy_cost` (the warp's alone), and the shield points the warp recharged |
| `blast` | `{range, hit, energy_cost, damage}`: Euclidean distance to the enemy on the line, to two decimals; the report's `destroyed`; the report's `energy_cost`; `BLAST_HIT_DAMAGE` on a hit and 0 on a miss. A blast kills or does nothing, so `damage` is a placeholder that says no more than `hit` does [D] |
| `torpedo` | `{range, hit}`: as for a blast. An accepted torpedo always hits; one with no enemy on its line is a refusal |
| `dock`, `long_range_scan`, `state`, `galaxy_map` | `{}`. A dock is told by its event being accepted, and a scan by `sectors_revealed` |

The **telemetry sink** takes three writes: a game started, a game ended (by key), and a command
run. [D; the three operations P] The Node adapter keeps the records in process memory, where
tests and the local server read them, and they are gone when the process ends. [D] The
Cloudflare adapter keeps them for good, as rows of a D1 database (Telemetry database, D-53). [D]

### Star Central messages
*Serves: G-1, F-command.* [D] The messages fleet command sends the captain, held in the core as
one table. Each **kind** of message is a row: its key, the names of its placeholders, and exactly
`WORDINGS_PER_KIND` wordings. A wording is a whole message with each placeholder written
`{name}`; code picks a wording and fills the placeholders, and never builds a sentence. [D]

| Kind (key) | Placeholders | Sent when |
|---|---|---|
| `lifetime_commendation` | `amount`, `label` | A positive counter's lifetime total reaches a rung |
| `lifetime_notoriety` | `amount`, `label` | A negative counter's lifetime total reaches a rung; the wordings are wry, not congratulatory [P] |
| `objective_met` | `amount`, `label` | A goal of the game is met; the wordings speak of this patrol's orders, not of the captain's record [D] |

`label` is the counter's label and `amount` the rung, or the goal's amount. Every wording opens with `Star Central`,
and names the label as a heading of the record with the amount apart from it, so it reads right
for every label and for an amount of 1. [P]

### GameView
*Serves: G-3, F-discovery.* [D] What a read-only display may see of a Game. The core makes
it from a Game and it holds only what the player has uncovered, and the game's goals, which the
player was given when the game started.

| Field | Type | Notes |
|---|---|---|
| `status` | playing \| won \| lost | |
| `stardate` | str | The Stardate display form |
| `sector_xy` | Coordinate | The ship's sector |
| `ship` | Ship | Every Ship field |
| `board` | str[10] | The ship's sector as map rows, the same as GameState's `map` |
| `galaxy` | 10×10 of `{enemies, starbases, stars}` or null | Null while the sector is hidden |
| `goals` | GoalState[`GOALS_PER_GAME`] | The game's goals with their progress, the same as GameState's `goals` |

### Viewers
*Serves: G-3.* [D] The sockets watching each game. The app layer makes frames and calls
`publish(view_id, frame)`. Each adapter holds the sockets, because upgrading a request and
keeping a socket open belong to the platform. The Node adapter keeps a list per `view_id` in
process memory. The Cloudflare adapter keeps them on the game's Durable Object, as hibernating
WebSockets, so the object can leave memory while viewers stay connected. Its `publish` is a
call on that object, which sends the frame to each of its sockets. [D] A frame is made from a
stored game: the core's view of it, and the achievements of the game's `player`, read from the
PlayerStore when the frame is made. [D]

### Agents
- **Enemies** act only inside EnemiesTurn. They know the ship's cell exactly and follow the
  same Ray rule as the ship. Each enemy independently fires or advances, chosen at random
  each turn, with no memory. [D]
- **The LLM** isn't a game actor. It is the player's interface: it sees what the tools
  return and follows the instructions for decorum and rendering. [D]

---

## 3. Relations

| Relation | Cardinality |
|---|---|
| GameStore *has* Game | 1 → 0..n, keyed by `view_id` |
| PlayerStore *has* lifetime totals | 1 → 0..n players, each with 0..1 total per counter |
| Counter *has* Ladder | 1 : 1, by the counter's `scale` |
| Game *has* Galaxy, Ship, ActiveSector, Counters | 1 → 1 each |
| Game *has* Goal | 1 → `GOALS_PER_GAME` |
| Goal *is on* Counter | each goal 1 counter; a counter 0..1 goal of a game |
| Galaxy *has* SectorRecord | 1 → 100 |
| Ship *is in* Sector (`sector_xy`) | exactly one sector |
| ActiveSector *is the live form of* the SectorRecord at `sector_xy` | 1 : 1 |
| ActiveSector *contains* Ship, Starbase, Enemy, Star | ship 1; starbase 0..1; enemies 0..`ENEMY_MAX_PER_SECTOR`; stars per record |
| Cell *holds* occupant | 0..1 |
| Game *is watched by* Viewer | 1 → 0..n |
| Game *was started by* player (GameStore `player`) | each game 1 player; a player 0..n games |
| Game *has* telemetry game record | 1 → 0..1, by the telemetry game key; a game stored without `new_game` has none |
| Telemetry game record *has* event record | 1 → 0..n, by `game_key`, ordered by `seq` |

## 4. Invariants

- Every coordinate is in `0..9`. [D]
- A coordinate is passed, returned, stored and said x first: a command's `x` and `y`, `[x, y]`
  in a Result, a view and a stored Game, `(x, y)` in a message. A field that holds one ends in
  `xy`. [D]
- A grid is rows of columns: `map`, `board` and the galaxy's `sectors` hold row 0 first, and the
  cell or sector at `(x, y)` is `grid[y][x]`. The core holds a coordinate as `Xy {x, y}` and
  reads its parts by name; that type is the one place the order of a pair is set. Where the core
  walks a grid it goes in row order: along row 0 from column 0, then each row below. [D]
- Each cell holds at most one occupant. Exactly one cell is `S`, and it is `ship_xy`. [D]
- Each `enemies_xy` entry is an `E` cell, and every `E` cell is in `enemies_xy`. [D]
- `galaxy[sector_xy].enemies == len(sector.enemies_xy)` after every command. Positions are
  never stored in the galaxy. [D]
- The `GALAXY_CENTER` record starts as `(visible, 0, 1, START_SECTOR_STARS)`. [D]
- `visible` only goes from false to true. [D]
- `startick` never decreases, and every time is a whole number of starticks. [D]
- `0 ≤ shields ≤ max_shields`, `0 ≤ hull ≤ max_hull`, `0 ≤ energy ≤ max_energy`,
  `0 ≤ quantorpedoes ≤ max_quantorpedoes`. [D]
- `status` leaves `playing` at most once, and never returns. [D]
- A counter never decreases. [P]
- A lifetime total never decreases, and each rung of a ladder is announced to a player at most
  once. [D]
- A game has `GOALS_PER_GAME` goals on different counters, none on a negative counter. A goal's
  counter and amount never change, and `met` only goes from false to true. [D]
- A game's commands change no game's play through a Star Central message: picking a wording
  never draws from a game's random stream. Choosing a game's goals doesn't either. [D]
- A refused command returns the game unchanged. [D]
- Games are isolated: a command on one never changes another. [D]
- Same seed, same start time and same commands give the same state. The core reads no clock:
  the start time is an input. [D]
- A viewer never changes a game: nothing it sends reaches the store or the core. [D]
- A GameView never shows a hidden sector, the seed or the RNG. [D]
- A frame never carries a player's id or a `game_id`: the achievements go out as rows. [D]
- A telemetry record never holds a `game_id`, a `view_id` or a player id, and its game key and
  player hash can't be turned back into one: a reader of telemetry can neither watch nor command
  a game. [D]
- Telemetry changes nothing a player sees: a command's Result, the stored game and the viewers'
  frame are the same whether the sink works, fails or drops the record. [D]
- A game record's `seed` and `started_unix_seconds`, with its accepted events' `tool` and `args`
  in `seq` order, give the game's final state. [D]

---

## 5. Geometry and randomness

### Ray
*Serves: F-danger, G-2.* [D] One rule for subwarp, blast, torpedo, enemy fire and enemy
advance.
```
ray(start, dest):
  if start == dest: return [start]
  step from start toward dest along the Bresenham line, appending each cell
  stop after appending an obstacle (off-board or not '.'), or on reaching dest
```

### Visibility
*Serves: F-discovery.* [D] A SectorRecord's counts are shown only when it is `visible`. A
record becomes visible at generation (the center only), when the ship warps into it, or
when a long-range scan covers it.
```
reveal(sector):
  if visible: stop
  visible = true;  counters.starbases_discovered += starbases
```
Warp and Long-range scan mark a sector visible only through `reveal`, so a starbase is counted
once, the first time its sector is seen. [D]

### Distances
`euclid(a, b)` sets ranges and costs. `chebyshev(a, b) ≤ 1` defines *adjacent*. [D]

### Random streams
*Serves: G-2, F-discovery.* [D] Two kinds of stream, both deterministic:
- **The game stream** `rng`, seeded from `seed` at creation and carried in the Game. Galaxy
  generation, enemy choices, blast kill rolls and enemy fire damage draw from it.
- **A side stream** `side_rng(seed, index)`, made fresh from the seed and an index each time it
  is needed and never stored. It depends on nothing else and leaves the game stream alone. Each
  use owns its indices: a **sector stream** `sector_rng(seed, sector_xy)` per sector, so a
  sector's layout depends only on the seed, the sector and its record; the **goals stream**
  `goals_rng(seed)`, which chooses a game's goals; and a **goal message stream**
  `goal_message_rng(seed, i)` per goal, which picks the wording that announces goal `i` as met.

The game stream never picks a Star Central message's wording, so the same seed and commands
play the same game whatever is announced. For a lifetime message the core takes the pick as a
number in [0, 1) from its caller, and the app layer draws it from the platform's own random
numbers (D-46). For a met goal the core takes it from the goal message stream, so the same
seed and commands also give the same events (D-48). [D]

---

## 6. Rules

Every action first checks, in this order: `status == playing`; any coordinate argument is
in `0..9`; then its own legality. A failed check refuses the action: `ok = false`, an
`error` message, and the game unchanged. [D]

### Game creation — *Serves: G-2* [D]
```
new_game(seed, start_unix_seconds):
rng = seeded(seed);  galaxy = generate(rng)
startick = floor(start_unix_seconds × STARTICKS_PER_STARDATE / SECONDS_PER_STARDATE) + STARDATE_EPOCH_OFFSET × STARTICKS_PER_STARDATE
ship = full;  sector_xy = GALAXY_CENTER;  sector = instantiate(GALAXY_CENTER)
last_event_startick = startick;  status = playing;  counters = all 0
goals = select_goals(seed)
```
The starting stardate is the real date: the Unix time in days plus `STARDATE_EPOCH_OFFSET`. The
caller reads the clock and passes it in. [D]

### Goal selection — *Serves: G-2, DYNAMICS Accumulation* [D]
```
select_goals(seed):
rng = goals_rng(seed)
amounts(counter) = the rungs of its ladder ≤ its goal_ceiling, if it may be a goal; else none
offered = the counters of the counter table with at least one amount
repeat GOALS_PER_GAME times:
    counter = a uniform pick from offered, removed from it
    goal = {counter, amount: a uniform pick from amounts(counter), met: false}
```
Every offered counter is equally likely and so is each of its amounts. The draws come from the
goals stream, so a seed's galaxy and play are the same as they would be without goals. A
negative counter, and a positive one whose ceiling is below its first rung, is never offered
(D-47). [D; uniform picks are P]

### Galaxy generation — *Serves: G-2, F-discovery* [D]
```
for each sector s in row order:
  center:     (visible, 0, 1, START_SECTOR_STARS)
  otherwise:  f = ENEMY_DISTANCE_FLOOR + euclid(s, GALAXY_CENTER)/ENEMY_DISTANCE_NORM × ENEMY_DISTANCE_SCALE
              enemies   = clamp(int(f × uniform(ENEMY_BASE_ROLL)), 0, ENEMY_MAX_PER_SECTOR)
              starbases = 0
              stars     = uniform(STARS_PER_SECTOR);  visible = false

then, from the game stream (D-38):
  target = uniform(STARBASE_EXTRA_MIN..=STARBASE_EXTRA_MAX)
  repeat target times:
    draw up to STARBASE_PLACE_TRIES random sectors s, until
      euclid(s, b) >= STARBASE_MIN_SPACING for every starbase b already placed (home base included)
    none fits:  stop, keeping the starbases placed so far
    otherwise:  starbases[s] = 1
```
At most one starbase per sector [P]; spacing is Euclidean, the metric warp distance uses [P]; a
starbase sector's enemies and stars are left as generated [P]. Constants are [T].

### Sector instantiation — *Serves: G-2, F-discovery* [D]
```
r = sector_rng(seed, sector_xy);  map = all '.'
place the starbase (if any), then each star, then each live enemy, then the ship,
each on a cell drawn from r among the empty cells
```
Drawing among the empty cells always succeeds: a board holds at most 19 occupants. [P]
Terrain is placed before enemies, so a sector's stars and starbase are the same on every
visit, and its enemies stand where the first of the original enemies stood.

### Warp — *Serves: G-2, F-discovery* [D]
```
illegal if target == sector_xy
time = round(WARP_TIME_K × ln(euclid(sector_xy, target) + 1));  cost = time × WARP_ENERGY_PER_TICK
illegal if energy < cost
if enemies are present: run EnemiesTurn;  if hull == 0: end game, stop
energy -= cost;  startick += time
recharge(max_shields)      # the Shield recharge rule: to full, as far as the energy left allows [D]
reveal(target);  sector_xy = target;  sector = instantiate(target);  last_event_startick = startick
counters.sectors_warped += 1      # the ship has arrived, whatever the ambush then does [P]
ambush: for each enemy in order, while hull > 0: with probability ENEMY_AMBUSH_CHANCE it fires once (the EnemiesTurn fire rule) [D]
run warp events
```
`euclid` is the distance in sectors and `time` is in whole starticks. Time and energy are
logarithmic in distance: the next sector is about a stardate away, and a farther one takes
and costs only a little more (D-5). The legality check is on the warp's `cost` alone, and
`report.energy_cost` is that `cost`; the recharge is paid on top and told as an event [P]. The
ship meets the ambush with the recharged shields. The hull is not repaired [D].

### Subwarp — *Serves: G-2, F-danger* [D]
```
limit = SUBWARP_MAX_STEPS_HOSTILE if enemies are present else SUBWARP_MAX_STEPS
r = ray(ship_xy, dest), dropping a final obstacle;  steps = min(len(r) − 1, limit)
illegal if steps == 0;  illegal if energy < steps × SUBWARP_ENERGY_PER_STEP
ship_xy = r[steps];  energy -= steps × SUBWARP_ENERGY_PER_STEP
startick += steps × SUBWARP_TIME_PER_STEP;  run stardate events
```

### Dock — *Serves: G-4* [D]
```
illegal if enemies are present, or no starbase, or starbase not adjacent
hull, shields, energy, quantorpedoes := max;  counters.docks += 1;  startick += DOCK_TIME
run stardate events
```

### Long-range scan — *Serves: F-discovery, F-danger* [D]
```
illegal if energy < LRS_ENERGY
energy -= LRS_ENERGY;  counters.scans += 1
for each sector in the 3×3 block around sector_xy: reveal it, report "E|B|S"; off-galaxy → "....."
startick += LRS_TIME [T]
run stardate events      # enemies present act; in a cleared sector the clock still advances, no one acts [D]
```

### Blast — *Serves: F-danger, G-4* [D]
```
hit = first enemy on ray(ship_xy, target);  illegal if none
r = euclid(ship_xy, hit);  illegal if r > BLAST_RANGE
cost = int(BLAST_ENERGY_BASE × √r);  illegal if energy < cost
destroyed = rng.unit() < kill_chance(r)      # one draw per blast [D]
if destroyed: destroy hit;  counters.blasts_hit += 1
else: report the miss (the enemy is untouched);  counters.blasts_missed += 1
energy -= cost;  startick += int(BLAST_TIME_A + BLAST_TIME_B × √r)      # paid hit or miss [D]
run stardate events

kill_chance(r):
  r ≤ BLAST_SURE_RANGE: BLAST_KILL_CHANCE_NEAR
  otherwise: BLAST_KILL_CHANCE_NEAR × (BLAST_KILL_CHANCE_FAR / BLAST_KILL_CHANCE_NEAR) ^ ((r − BLAST_SURE_RANGE) / (BLAST_RANGE − BLAST_SURE_RANGE)) [D]
```

### Torpedo — *Serves: F-danger, G-4* [D]
```
illegal if quantorpedoes == 0, or energy < TORPEDO_ENERGY
hit = first enemy on ray(ship_xy, target);  illegal if none
destroy hit;  quantorpedoes -= 1;  counters.torpedoes_fired += 1
energy -= TORPEDO_ENERGY;  startick += TORPEDO_TIME
run stardate events
```

### Destroy enemy — *Serves: F-danger* [D]
```
remove from enemies_xy and map;  galaxy[sector_xy].enemies = len(enemies_xy)
counters.enemies_destroyed += 1;  if enemies_xy is empty: counters.sectors_cleared += 1
```

### Stardate events — *Serves: F-danger* [D]
```
if startick − last_event_startick < EVENT_INTERVAL: stop
for e in [ShieldReplenish, EnemiesTurn]: if e.can_occur: messages += e.execute
last_event_startick = startick
```

### Game end — *Serves: G-2, F-danger* [D]
Runs after every accepted action.
```
if hull == 0: status = lost;  counters.games_lost += 1
else if the sum of galaxy enemies == 0: status = won;  counters.games_won += 1
else if stranded and a starbase is present: energy = max(energy, STARBASE_EMERGENCY_ENERGY)
else if stranded: status = lost;  counters.games_lost += 1;  counters.times_stranded += 1
```
Each way of ending is one row: its status, its message and what it counts. A ship the starbase
rescues is not counted as stranded: the game didn't end. [P]
*Stranded* [P]: energy is below the warp cost to the nearest visible starbase sector other
than `sector_xy` (infinite if there is none), by the Warp rule's `cost`. Outside Star
Central, Star Central is always that fallback. `STARBASE_EMERGENCY_ENERGY` is less than any
warp costs: it pays for moving and fighting inside the starbase's sector, to dock (D-30).

### Goal check — *Serves: G-1, F-command, DYNAMICS Accumulation* [D]
Runs after every accepted action, after Game end. A query and a refused command check nothing.
```
for each goal i, in the game's order:
    if goal.met or counters[goal.counter] < goal.amount: next
    goal.met = true
    events += message(objective_met, amount = goal.amount, label = the counter's label,
                      roll = the first number of goal_message_rng(seed, i))
```
A goal is met once and stays met. One action can meet several goals, each with its own message.
The message follows the game's own events, the end of the game included (D-48). [D]

### EnemiesTurn — *Serves: F-danger* [D]
```
can_occur: enemies are present
for each enemy in enemies_xy order:
  EnemyAdvance with probability ENEMY_ADVANCE_FRACTION (from rng), else EnemyFire
```

### EnemyAdvance — *Serves: F-danger* [D]
```
roll = rng.unit()    # one draw per advance
approach = left if roll < ENEMY_OBLIQUE_CHANCE/2, right if roll ≥ 1 − ENEMY_OBLIQUE_CHANCE/2, else head-on [D]
head-on:  r = ray(enemy, ship_xy);  dest = r[min(ENEMY_ADVANCE_STEPS, len(r) − 1)]
oblique [P]:  repeat ENEMY_ADVANCE_STEPS times from `at`:
                head = ray(at, ship_xy)[1];  side = at + (head − at) turned one octant left or right
                next = head if euclid(side, ship_xy) > euclid(at, ship_xy) else side
                if next is not empty: stay (no fallback)
                at = next
              dest = at
if dest is empty: move enemy to dest   else: stay
```

### EnemyFire — *Serves: F-danger* [D]
```
if ray(enemy, ship_xy) doesn't end at ship_xy: no effect
factor = uniform(rng, ENEMY_FIRE_VARIANCE_MIN..ENEMY_FIRE_VARIANCE_MAX)      # one draw per shot, blocked or not
d = euclid(enemy, ship_xy)
base = d ≥ ENEMY_FIRE_FAR_RANGE:  ENEMY_FIRE_FAR
       d > ENEMY_FIRE_NEAR_RANGE: ENEMY_FIRE_NEAR × (ENEMY_FIRE_FAR / ENEMY_FIRE_NEAR) ^ ((d − ENEMY_FIRE_NEAR_RANGE) / (ENEMY_FIRE_FAR_RANGE − ENEMY_FIRE_NEAR_RANGE))
       otherwise:                 linear from ENEMY_FIRE_BASE at 1 to ENEMY_FIRE_NEAR at ENEMY_FIRE_NEAR_RANGE      [D, D-39]
damage = round(base × factor)
shields absorb up to their value; hull absorbs the rest up to its value
counters.shield_damage += what the shields absorbed;  counters.hull_damage += what the hull absorbed
```

### ShieldReplenish — *Serves: F-danger, G-4* [D]
```
can_occur: shields < max_shields and energy ≥ 1
recharge(SHIELD_REPLENISH)
```

### Shield recharge — *Serves: F-danger, G-4* [D]
One rule, used by ShieldReplenish in a sector and by Warp.
```
recharge(limit):
  points = min(limit, max_shields − shields, energy × SHIELD_POINTS_PER_ENERGY)
  if points == 0: stop, with no message [P]
  cost = ceil(points / SHIELD_POINTS_PER_ENERGY)       # rounds up: a recharge is never free [D]
  shields += points;  energy -= cost
```

### StarbaseHail — *Serves: F-command, F-discovery* [D]
```
can_occur: a starbase is present
message: "all clear, approach for docking" if no enemies else "under attack, needs assistance"
```

### Stardate display — *Serves: F-command* [D]
One derivation turns a startick count into digits, for the clock and for a length of time alike.
```
parts(ticks):
  whole = ticks div STARTICKS_PER_STARDATE
  thousandths = (ticks mod STARTICKS_PER_STARDATE) × 1000 div STARTICKS_PER_STARDATE      # truncated, never rounded
  return whole, thousandths div 10 as 2 digits (dd), thousandths mod 10 (d)

stardate(startick):  whole zero-padded to 7 digits, its last four set apart:  ddd.dddd.dd.d
duration(ticks):     whole unpadded:  d.dd.d
```
Stardate 1020773.365 shows as `102.0773.36.5`. A duration of 416 starticks shows as `1.04.0`, and
one startick as `0.00.2`. One startick is 0.0025 stardates, so every startick changes the
display. `GameState.stardate` and `GameView.stardate` are the stardate form; every action
report's `time` is the duration form.

### Game lookup — *Serves: G-1* [D]
In the app layer.
```
new_game: seed = random u32;  game_id = random id;  view_id = sha256(game_id)
          store new_game(seed, the adapter's clock in Unix seconds) under view_id,
          with player = the signed-in player, or `local` where there is no sign-in
          write the game's telemetry record (Telemetry)
any other tool: load sha256(game_id), else error "Game not found"
                a stored game the core can't read is not found too
apply the command;  if refused: record its telemetry event and return the result
store the returned game, beside the same player
record its telemetry event (Telemetry)
run the Lifetime totals rule for the commanding player
publish the game's view frame to the viewers (Viewer socket)
append the Lifetime totals rule's messages to the result's events;  return the result
```
The frame is published after the totals move, so its achievements include what the command
counted. [D]
`new_game` answers with the core's state query on the new game, and its report carries the
`game_id`, the goals as that state shows them, and the viewer's link. A command's events are in
this order: the game's own, then any goal met (Goal check, from the core), then any lifetime
message (from the app layer). [D]

### Telemetry — *Serves: the tuning of G-2 and G-4* [D]
In the app layer, from the Game lookup rule.
```
game_key(game_id)  = sha256("starreach-telemetry-game-1:" + game_id)
player_hash(player) = sha256(PLAYER_HASH_SALT + ":" + player)

new_game:  sink.game_started({game_key, started_unix_seconds = the time given to the core, seed,
                              rules_version = RULES_VERSION, player_hash, client})
a command on a game the core reads, accepted or refused, once an accepted one is stored:
    before, after = the state of the game it ran on, the Result's state
    sink.command_run(the event: tool, args, ok, error, the clock and ship of `after`,
                     what rose from `before` to `after`, the tool's detail)
    if before.status == playing and after.status != playing: sink.game_ended(game_key, GameEnd of `after`)
any write that fails: log it; the command goes on as if it had not
```
`new_game`, `whoami`, a call on an unknown `game_id` and a call MCP rejects for its arguments
are not calls on a game and leave no event. [P] An event is recorded once the game is stored,
before the lifetime totals move and the viewers are told, so an accepted command that is stored
is in the record even if a later step fails. [P]

Everything in an event comes from Results: the two states, the report, and the core's view for
the count of visible sectors. The app layer reads no Game field. A state gives the clock as a
stardate, which is read back to starticks by the Stardate display rule turned round, so the app
layer holds its own copy of `STARTICKS_PER_STARDATE`; a test holds the event's `startick` to the
stored game's clock. [P] A warp's `shield_recharge` is the shields' rise plus what enemy fire took
from them during the warp, since nothing else moves the shields on a warp. [P]

**`RULES_VERSION` must be bumped**, by one and by hand, in the same change as any change to a
rule of this section that the core plays by, or to a number of the Numbers table that play
depends on: anything after which the same captain's choices could go differently. A change to
wording, to the viewer, to telemetry itself or to a Star Central message does not bump it. [D;
where the line falls is P] A game keeps the version it started under, whatever is deployed when
it is finished.

### Ladder — *Serves: F-command* [D]
In the core, beside the counter table.
```
rung(scale, i) = scale × [1, 2, 5][i mod 3] × 10^(i div 3)        i = 0, 1, 2, …
rungs_crossed(counter, before, after) = every rung r of the counter's scale with before < r ≤ after, rising
standing(counter, total) = {reached: the last rung ≤ total, or none;  next: the first rung > total}
```
With scale 10 the rungs are 10, 20, 50, 100, 200, 500, 1000 and so on without a practical end.
One template of counter, scale and rung makes every achievement; none is a special case (D-44).

### Lifetime totals — *Serves: G-1, F-command* [D]
In the app layer, after an accepted command.
```
increments = for each counter, the game's count after the command − its count before, where that is above 0
none: no message, and the PlayerStore isn't called
player = the signed-in player, or `local` where there is no sign-in
{before, after} = PlayerStore.add(player, increments)
for each counter in table order, for each rung in rungs_crossed(counter, before, after):
    message(the counter's lifetime kind, amount = rung, label = the counter's label, roll = a fresh random number)
```
Every counter accumulates, the negative ones too, over all of the player's games. A new game's
counters start at 0, so nothing is added twice, and a game left midway keeps what it already
added. The totals go to the player who issued the command, whoever started the game. Nothing
guards against repeating a cheap action. Reaching a rung earns the message and nothing else. [D]
Play toward a goal is ordinary play and counts here like any other. A goal met and a rung
reached are announced separately, each in the command where it happens, which can be the same
command. [D]

### Star Central message — *Serves: F-command* [D]
In the core.
```
message(kind, roll, values): wording = the kind's wordings[floor(roll × WORDINGS_PER_KIND)], held within the list
                             replace each {placeholder} of the kind with its value
lifetime kind of a counter: lifetime_commendation if it may be a goal, else lifetime_notoriety
```
`roll` is supplied by the caller: the app layer for a lifetime message, the Goal check rule for
`objective_met` (Random streams). The lifetime kind is chosen at this one place. [P]

---

## 7. Numbers [T]

Referred to by name everywhere else.

| Name | Value | Unit | Decision |
|---|---|---|---|
| `GALAXY_SIZE` | 10 | sectors per side | D-1 |
| `SECTOR_SIZE` | 10 | cells per side | D-1 |
| `GALAXY_CENTER` | (4,4) | sector | D-2 |
| `START_SECTOR_STARS` | 4 | stars | D-2 |
| `ENEMY_BASE_ROLL` | −3..9 | uniform int | D-3 |
| `ENEMY_DISTANCE_FLOOR` | 0.3 | factor | D-3 |
| `ENEMY_DISTANCE_SCALE` | 0.7 | factor | D-3 |
| `ENEMY_DISTANCE_NORM` | √50 | sectors | D-3 |
| `ENEMY_MAX_PER_SECTOR` | 9 | enemies | D-3 |
| `STARS_PER_SECTOR` | 2..8 | uniform int | D-3 |
| `STARBASE_EXTRA_MIN` | 3 | starbases | D-38 |
| `STARBASE_EXTRA_MAX` | 5 | starbases | D-38 |
| `STARBASE_MIN_SPACING` | 3 | sectors, Euclidean | D-38 |
| `STARBASE_PLACE_TRIES` | 100 | random draws per starbase | D-38 |
| `WARP_TIME_K` | 600 | starticks per unit of ln(distance in sectors + 1), rounded to a whole startick | D-5 |
| `WARP_ENERGY_PER_TICK` | 10 | energy per startick of a warp | D-5 |
| `SUBWARP_MAX_STEPS` | 10 | cells | D-6 |
| `SUBWARP_MAX_STEPS_HOSTILE` | 3 | cells | D-6 |
| `SUBWARP_ENERGY_PER_STEP` | 2 | energy | D-6 |
| `SUBWARP_TIME_PER_STEP` | 1 | startick | D-6 |
| `DOCK_TIME` | 5 | starticks | D-7 |
| `LRS_ENERGY` | 500 | energy | D-8 |
| `LRS_TIME` | 3 | starticks | D-8 |
| `BLAST_RANGE` | 9 | cells; also where the kill chance reaches `BLAST_KILL_CHANCE_FAR` | D-9, D-36 |
| `BLAST_SURE_RANGE` | 4 | cells, up to which a blast kills with `BLAST_KILL_CHANCE_NEAR` | D-36 |
| `BLAST_KILL_CHANCE_NEAR` | 0.9 | probability a blast kills, up to `BLAST_SURE_RANGE` | D-36 |
| `BLAST_KILL_CHANCE_FAR` | 0.1 | probability a blast kills at `BLAST_RANGE` | D-36 |
| `BLAST_ENERGY_BASE` | 1000 | energy per √cell | D-9 |
| `BLAST_TIME_A` | −0.37840 | starticks | D-9 |
| `BLAST_TIME_B` | 1.37840 | starticks per √cell | D-9 |
| `TORPEDO_ENERGY` | 100 | energy | D-9 |
| `TORPEDO_TIME` | 1 | startick | D-9 |
| `EVENT_INTERVAL` | 3 | starticks | D-10 |
| `ENEMY_ADVANCE_FRACTION` | 1/3 | probability per enemy | D-10 |
| `ENEMY_ADVANCE_STEPS` | 2 | cells | D-10 |
| `ENEMY_OBLIQUE_CHANCE` | 0.5 | probability an advance is oblique, split evenly left and right | D-34 |
| `ENEMY_AMBUSH_CHANCE` | 0.3 | probability per enemy that it fires when the ship arrives | D-35 |
| `ENEMY_FIRE_BASE` | 2000 | damage at 1 cell | D-39 |
| `ENEMY_FIRE_NEAR` | 1800 | damage at `ENEMY_FIRE_NEAR_RANGE` | D-39 |
| `ENEMY_FIRE_NEAR_RANGE` | 2 | cells, where the exponential falloff begins | D-39 |
| `ENEMY_FIRE_FAR` | 100 | damage at `ENEMY_FIRE_FAR_RANGE` and beyond | D-39 |
| `ENEMY_FIRE_FAR_RANGE` | 9 | cells, where damage stops falling | D-39 |
| `ENEMY_FIRE_VARIANCE_MIN` | 0.75 | lowest damage factor of a shot | D-37 |
| `ENEMY_FIRE_VARIANCE_MAX` | 1.25 | highest damage factor of a shot | D-37 |
| `SHIP_MAX_HULL` | 2000 | hp | D-11 |
| `SHIP_MAX_SHIELDS` | 3000 | hp | D-11 |
| `SHIP_MAX_ENERGY` | 50000 | energy | D-11 |
| `SHIP_MAX_QUANTORPEDOES` | 7 | torpedoes | D-11 |
| `STARTICKS_PER_STARDATE` | 400 | starticks in a stardate [D] | D-12 |
| `SECONDS_PER_STARDATE` | 86400 | seconds of real time in a stardate: a stardate is a day [D] | D-12 |
| `STARDATE_EPOCH_OFFSET` | 1000000 | stardates added to the Unix time in days for a game's starting stardate [D] | D-12 |
| `SHIELD_REPLENISH` | 500 | hp per firing | D-27 |
| `SHIELD_POINTS_PER_ENERGY` | 10 | hp per energy, in a sector and on a warp [T] | D-27 |
| `STARBASE_EMERGENCY_ENERGY` | 1000 | energy floor a starbase restores to a stranded ship | D-30 |
| `GOALS_PER_GAME` | 3 | goals a new game sets, each on a different counter [D] | D-47 |
| `COUNTER_SCALE` | `enemies_destroyed` 10; `shield_damage` 1000; `hull_damage` 100; every other counter 1 | each counter's `scale` in the counter table: the unit of its ladder [T] | D-43 |
| `WORDINGS_PER_KIND` | 20 | wordings in every kind of Star Central message [D] | D-46 |
| `COUNTER_GOAL_CEILING` | `enemies_destroyed` 127; `sectors_cleared` 41; `sectors_warped` 56; `docks` 18; `starbases_discovered` 3; `blasts_hit` 57; `torpedoes_fired` 67; `scans` 33; `games_won` 0; every counter that may not be a goal 0 | each counter's `goal_ceiling` in the counter table: the most a goal may ask, 0 for not offered [T] | D-43 |
| `RULES_VERSION` | 1 | the rules version a new game's telemetry record carries; bumped by hand (Telemetry rule) [D] | D-51 |
| `PLAYER_HASH_SALT` | `starreach-player-hash-1` | text hashed with a player id into the player hash; a constant in the code [D] | D-51 |
| `BLAST_HIT_DAMAGE` | 1000 | the `damage` a hitting blast's telemetry event carries: a telemetry placeholder, used by no rule of the game [D] | D-51 |
| `LONG_PAUSE_SECONDS` | 300 | real seconds between two commands of a game from which the telemetry report counts the gap as a long pause and leaves it out of a game's length without pauses [P] | D-54 |
| `HTTP_PORT` | 8572 | port the `just` recipes pass to the local servers | D-21 |
| `RECONNECT_MIN_MS` | 1000 | ms a viewer page waits before its first reconnect; it doubles after each failure | D-31 |
| `RECONNECT_MAX_MS` | 15000 | ms, the longest a viewer page waits to reconnect | D-31 |
| `VIEWER_MAX_FRAME_BYTES` | 128 | largest frame a viewer may send before its socket closes; room for a ping or a small view setting | D-31 |
| `LOW_GAUGE_FRACTION` | 0.25 | share of its maximum below which a page gauge turns red | D-31 |

---

## 8. Interface

### Core API (Rust → WASM) [D]
Seven functions over JSON text. The core holds no state between calls.

| Function | Input | Output |
|---|---|---|
| `new_game` | `seed: u32`, `start_unix_seconds` | Game, with its goals chosen from the seed (Goal selection) |
| `apply` | `game: Game`, `command: Command` | `{game: Game, result: Result}` |
| `view` | `game: Game` | GameView |
| `counter_table` | — | The counter table: `[{key, label, may_be_goal, scale, goal_ceiling}]`, a row per Counters field |
| `rungs_crossed` | `key`, `before`, `after` | The rungs of that counter's ladder with `before < rung ≤ after`, rising (Ladder) |
| `ladder_standing` | `key`, `total` | `{reached, next}`: the last rung at or below the total, null below the first, and the next rung (Ladder) |
| `commendation` | `key`, `amount`, `roll` | Star Central's message, as text, for that counter's lifetime total reaching `amount`; `roll` in [0, 1) picks the wording (Star Central message) |

The last three return nothing for a key that names no counter. A lifetime total crosses the
boundary as a JavaScript number, a whole number below 2^53. [P]

`Game` is opaque to the app layer. The RNG's 64-bit state inside it is serialized as a string so a
JavaScript round trip can't lose precision; the startick clock is a plain number, far below the
size where JavaScript loses whole numbers. `start_unix_seconds` is the real time the game starts
at: the core reads no clock, so the adapter supplies it (Game creation). Given text that isn't
a Game it reads, such as a game stored before a change to the Game's fields, `apply` and `view`
return nothing, and the app layer answers as for an unknown game. Stored games are not migrated. [D]

### Commands
Each command is `{type, …args}`. Every command returns the same **Result** shape:
`{ok: bool, error: string | null, events: string[], report: object | null, state: GameState}`.
`report` is the command's own data when `ok`, and null when refused. [D]

| Command `type` | Args | Kind | Rule | `report` |
|---|---|---|---|---|
| `state` | — | query | — | null |
| `galaxy_map` | — | query | — | `{map: string[10]}` |
| `galaxy_warp` | `x, y` | action | Warp | `{sector_xy, energy_cost, time}` |
| `subwarp` | `x, y` | action | Subwarp | `{ship_xy, path, energy_cost, time}` |
| `dock` | — | action | Dock | `{time}` |
| `long_range_scan` | — | action | Long-range scan | `{scan: string[3], energy_cost, time}` |
| `blast` | `x, y` | action | Blast | `{hit_xy, path, destroyed, energy_cost, time}` |
| `torpedo` | `x, y` | action | Torpedo | `{hit_xy, path, destroyed, energy_cost, time}`; `destroyed` is always true |

A coordinate argument is the command's `x` (column) and `y` (row). `path` is the ray's cells in
order, each `[x, y]`. `galaxy_map` rows are 10 space-separated entries: visible `E|B|S`, hidden `.....`.
Every `time` is how long the action took, as a string in the duration form of the Stardate
display rule. [D]

**GameState:** `status, sector_xy, ship_xy, ship_hull, ship_max_hull, ship_shields,
ship_max_shields, ship_energy, ship_max_energy, ship_quantorpedoes,
ship_max_quantorpedoes, starbase_xy, enemies: EnemySight[], star_count, base_count, enemy_count,
map: string[10], stardate: "ddd.dddd.dd.d", counters: Counters, goals: GoalState[]`.
`goals` are the game's goals in the Game's order, each `{counter, label, count, amount, met}`
(Goal), so every Result shows where they stand. [D]

### MCP tools (app layer) [D]
One tool per core command, each taking `game_id` plus the command's args, and returning
the core Result. Plus:

| Tool / prompt | Args | Returns |
|---|---|---|
| `new_game` | — | Result with `report: {game_id, goals, viewer_url}`. `goals` are the game's goals as `state.goals` shows them. `viewer_url` is the viewer's link, `<origin>/viewer?view=<view_id>`; it never holds the `game_id` [D] |
| `whoami` | — | `{signed_in: true, player: <sub>}` on a signed-in endpoint, `{signed_in: false}` otherwise (D-41) [P] |
| prompt `instructions` | — | The decorum and rendering instructions for the LLM, which `initialize` also returns as the server's instructions |

The instructions reach the LLM as soon as its client connects, since `initialize` returns them;
most clients load a prompt only when the user picks it. They cast it as the ship's computer,
working closely with the captain to make the galaxy safe, and tell it to give the captain the
`viewer_url` and then wait for orders rather than play on its own [D]. They tell it to present
the game's three goals when the game starts, one short line each worded as an order, before the
offer of a map and with the viewer link still last, and to report each goal's count against its
amount when the captain asks [D]. Facts about one tool go in
that tool's description: `subwarp`'s states the Subwarp rule's hostile-sector cap, so a move that
stops short isn't a surprise [D]. The instructions say how to read a stardate and a duration (a
stardate is a day), `state`'s description gives the stardate form, and each action's description
says how to read `report.time` [D].

No tool returns telemetry, and recording it changes no tool's Result. `new_game` notes the MCP
client that called it for the game's record, and every tool that takes a `game_id` leaves an
event (Telemetry). [D]

No tool returns a player's lifetime totals or achievements [D]: a player sees them only on the
viewer (D-49). They reach the conversation one at a time, as Star Central's message in the `events`
of the command that reached the rung (Lifetime totals), and the instructions tell the LLM to
relay each in character and to point the captain to the viewer for the list. [D]

An unknown `game_id`, or one whose stored game the core can't read, returns
`{ok: false, error: "Game not found", …}` with `state` null.
Arguments that don't fit a tool's schema, such as a missing `game_id` or a coordinate that
isn't an integer, are rejected by MCP as a tool error and never reach the game. An integer
coordinate outside `0..9` does reach the core, which refuses it with a Result. [P]

### HTTP (adapters) [D]

| Route | Returns |
|---|---|
| `POST /mcp` | Streamable-HTTP MCP. On Cloudflare it needs a signed-in player (D-41): without a valid auth/ access token carrying `starreach:play`, 401 (403 for a missing scope) with `WWW-Authenticate: Bearer resource_metadata=…, scope="starreach:play"` [D, the details P]. The Node adapter is open |
| `GET /.well-known/oauth-protected-resource`, `GET /.well-known/oauth-protected-resource/mcp` | RFC 9728 metadata for `/mcp`: `resource: STARREACH_RESOURCE`, `authorization_servers: [AUTH_ISSUER]`, `scopes_supported: ["starreach:play"]` (Cloudflare only) [P] |
| `GET /health` | `{status: "ok"}` |
| `GET /telemetry` | Everything the in-memory telemetry sink holds (Telemetry route). Node adapter only [D]; on Cloudflare it is any other path |
| `GET /` | The home page: a short briefing with how to connect, and what the game records about play (D-40, D-53). Cloudflare redirects `/index.html` to `/` [P] |
| `GET /viewer` | The viewer page. `?view=<view_id>` chooses the game. Cloudflare redirects `/viewer.html` to `/viewer` [P]. With no game, its notice links to `/` |
| `GET /css/styles.css`, `GET /css/home.css`, `GET /js/script.js`, `GET /fonts/oxanium.woff2`, `GET /images/viewer.jpg` | The pages' files |
| WebSocket `/live/<view_id>` | The game's frames, read-only [P] |
| any other path | 404 |

The app layer serves `/mcp` and `/health` as one fetch handler. MCP over HTTP is stateless:
each request gets a fresh MCP server, and games live in the GameStore. [P] Adapters serve the
pages and the socket, and supply the telemetry sink (Telemetry sink). The Node adapter serves all of these in both modes, and in stdio mode
also serves MCP over stdio, from one process that holds the games. It takes `--host` and
`--port` to bind and `--origin` for where browsers reach it. A stdio process that finds the
port held by a Starreach server forwards its MCP messages there instead, so one process still
holds every client's games, and refuses to start if anything else holds it. A stdio process
exits when its client closes stdin, which ends the games it holds. [P]

The Cloudflare adapter is a Worker that serves `/mcp` and `/health` through the app layer's
handler, and takes the viewer link's origin from the request. [D] It keeps each player's lifetime
totals in the Durable Object named by the player's `sub` (PlayerStore), and telemetry in a D1 database (Telemetry database). [D] `/mcp` serves only a signed-in
player [D]: Starreach is an OAuth resource server only and never runs a sign-in flow. It verifies auth/'s access token offline with the vendored auth-client
(`adapters/cloudflare/vendor/auth-client/`), pinning `iss` = `AUTH_ISSUER` and accepting an `aud` of
`STARREACH_RESOURCE` (the MCP endpoint's canonical URL, which auth/ writes when the client names
the resource) or `STARREACH_CLIENT_ID` (when it names none), and fetches auth/'s keys through the `AUTH_SERVICE` service binding, never a
public same-zone fetch (D-41). [P] Locally it runs under `wrangler dev` (`just cf-dev`). Its production environment
is routed to `starreach.yuwakisa.com` (D-20) and deployed there with `just cf-deploy`. [D]

The Worker hands a viewer's socket upgrade to the Durable Object named by the path's `view_id`,
with no sign-in: the link carries a hash, not the `game_id`, and the socket is read-only. [D] A `/live/` request that isn't a WebSocket
upgrade, or whose id isn't a `view_id`, gets the 404 of any other path. [P] The pages are
`public/` served as Workers static assets: a request that matches a file is answered without
running the Worker, and every other request reaches it. [D] `public/.assetsignore` keeps
`instructions.txt` out of the assets, since the Worker bundles it as a module; everything else
in `public/` is served, which adds the font's licence text to the pages' files. [P]

### Telemetry sink (app layer) [D]
The app layer writes telemetry through one interface, which each adapter supplies beside its
GameStore and PlayerStore. It is always supplied: there is no running without one.

| Operation | Input | Effect |
|---|---|---|
| `gameStarted` | a game record without `end` | Holds the record with `end` null |
| `gameEnded` | `game_key`, GameEnd | Completes that game's record |
| `commandRun` | an event record without `seq` | Holds the event under the next `seq` of its game |

A write that fails is logged by the app layer and fails nothing else. [D] The Node adapter
supplies the in-memory sink, one for the life of the process, in both of its modes. [D] The
Cloudflare adapter supplies a sink that writes each record to its D1 database (Telemetry
database). [D] No tool gives telemetry out, and the only route that does is the Node adapter's
`GET /telemetry`. The telemetry report reads the records back from either place (Telemetry report).

### Telemetry route (Node adapter) [D]
`GET /telemetry` on the Node adapter's HTTP server returns every record its in-memory sink
holds, for every game: a viewer follows one game and telemetry spans all of them, so it is no
part of a viewer link and never goes over a viewer's socket. [D] The records live in the
process's memory and are gone when the server stops. [D] The Cloudflare Worker does not serve
the route: there the path gets the 404 of any other path. [D]

The body is one JSON object per line, each line ended by a newline, as
`application/x-ndjson` [P]:

| Line | Holds | Order |
|---|---|---|
| `{"game": <game record>}` | A game record, `end` null while the game goes on | First, in the order the games started |
| `{"event": <event record>}` | An event record | After every game line, in the order the sink received them, so each game's are in `seq` order |

A server that has recorded nothing answers 200 with an empty body. Only `GET` reads it; any
other method gets the 404 of any other path. The route is served in both of the adapter's modes
and is as open as the adapter's `/mcp`. [P] `just telemetry` prints it for the local server at
`HTTP_HOST`:`HTTP_PORT`. [D]

### Telemetry database (Cloudflare adapter) [D]
*Serves: the tuning of G-2 and G-4: play on the deployed game is kept for good and can be asked
questions in SQL.* [D] One D1 database, `starreach-telemetry`, bound to the Worker as
`TELEMETRY`, holds every telemetry record of the games played there (D-53). It has two tables,
one row per record. The fields asked about most are columns and the others are JSON in `rest`
[D; which column holds what, the names and the types are P]. No column holds a `game_id`, a
`view_id` or a player id.

**`games`**: a row per game record, keyed by `game_key`. `new_game` writes it with the columns
from `outcome` on NULL, and the command that ends the game fills those.

| Column | Type | Holds |
|---|---|---|
| `game_key` | TEXT, primary key | The record's `game_key` |
| `started_unix_seconds`, `seed`, `rules_version` | INTEGER | The record's fields of those names |
| `player_hash` | TEXT | The record's `player_hash` |
| `client_name`, `client_version`, `client_user_agent` | TEXT or NULL | The record's `client`, a column per part |
| `outcome`, `ended_by` | TEXT or NULL | The GameEnd's fields of those names |
| `rest` | TEXT or NULL | JSON `{counters, goals}`: the GameEnd's other two fields |

**`events`**: a row per event record, keyed by (`game_key`, `seq`).

| Column | Type | Holds |
|---|---|---|
| `game_key` | TEXT | The record's `game_key` |
| `seq` | INTEGER | The count of the game's rows when this one was inserted, taken inside the insert: from 0, in the order the database got them [P] |
| `unix_seconds`, `startick`, `ticks`, `energy`, `shields`, `hull`, `torpedoes`, `damage_taken`, `sectors_revealed`, `sectors_cleared` | INTEGER | The record's fields of those names |
| `tool` | TEXT | The record's `tool` |
| `accepted` | INTEGER | 1 or 0 |
| `refusal` | TEXT or NULL | The record's `refusal` |
| `distance`, `range` | REAL or NULL | `detail.distance` and `detail.range`, NULL where the tool tells none |
| `hit` | INTEGER or NULL | `detail.hit` as 1 or 0, NULL where the tool tells none |
| `rest` | TEXT | JSON `{args, detail}`: the record's `args`, and its `detail` whole, the parts that have columns included [P] |

An event row needs no `games` row: there is no foreign key, so a game's events are kept even
where its game row is missing. [P] Indexes: `games` by `started_unix_seconds` and by
`player_hash`, `events` by `unix_seconds` and by `tool`; the `events` key is what joins a
game's events to its row, in `seq` order. [D; which indexes P]

```
gameStarted(start):   INSERT the games row, end columns NULL
gameEnded(key, end):  UPDATE the games row of key; no such row is a failed write
commandRun(event):    INSERT the events row, seq = COUNT of the game's rows
each write:           started at once and handed to the request's waitUntil; the sink's
                      operation returns without waiting for the database
                      a write that fails is logged and dropped
```

The player's reply never waits on the database, and a failing database fails no command. [D]
Because a write goes on after the sink's operation has returned, the sink logs a failure
itself. [P]

The tables are one schema file, `adapters/cloudflare/telemetry_schema.sql`, every statement of
which is safe to run again. There is no migration history. [D] `just cf-d1-local` applies it to
the local database `wrangler dev` uses, and `cf-dev` and `cf-up` run that first [P];
`just cf-d1-production` creates the production database and, run again once its id is in
`wrangler.jsonc`, applies the file to it. [D; the two runs P] `just cf-deploy` is refused while
`wrangler.jsonc` holds no production database id. [P] The Worker's tests apply the file to their
own local database. [D]

What each transport lets the server tell of the MCP client [P]:

| Path | `name`, `version` | `user_agent` |
|---|---|---|
| Node, MCP over stdio | The client's `initialize` | null |
| Node, a second stdio process forwarding to the first | null | The forwarding process's own, not the client's |
| `/mcp` over HTTP, Node and Cloudflare | null | The request's `User-Agent` |

The auth/ access token names the player and the audience and not the client that obtained it, so
sign-in adds nothing here. Whether the `User-Agent` tells Claude Desktop from Claude Code is not
known until both have been recorded. [P]

### Telemetry report (tools) [D]
*Serves: the tuning of G-2 and G-4: the designer asks the recorded play the questions the design
depends on, and the answers are cited in RATIONALE as "Measured by".* [D] `just telemetry-report`
prints one report as plain text tables (D-54). It reads and never writes.

| Invocation | Source |
|---|---|
| `just telemetry-report` | The production D1 database, by two read-only queries through `wrangler d1 execute --remote --env production --json`, on the existing wrangler login [D]. Refused, before wrangler runs, while `wrangler.jsonc` still holds the placeholder id: the database doesn't exist yet [P] |
| `just telemetry-report local` | The local server's `GET /telemetry` at `HTTP_HOST`:`HTTP_PORT` [D]. Fails with "start one with: just up" when nothing listens there |
| `just telemetry-report local-d1` | The local D1 database of `wrangler dev`, by the same two queries with `--local` [P] |

A number among the arguments, in either order, is a number of days: the report then covers the
games started in the last that many days. [D; a game belongs by its start P] `production` may
also be named.

```
source → records:   local:  each line of the dump is a game record or an event record
                    D1:     SELECT * FROM games  WHERE started_unix_seconds >= since
                            SELECT * FROM events WHERE unix_seconds >= since
                            each row → its record: columns by name, `end` from outcome, ended_by
                            and rest, `args` and `detail` from rest
report(records, since):
    games  = records' games started at or after since
    events = the events of those games; an event whose game has no record is left out, and counted in the heading
    one rules version among the games:  the sections once
    several:                            every section once per rules version, lowest first
```
The same code makes the report from the records whichever source gave them, so the local report
is a true preview of production's. [D] The record a D1 row gives is the record the sink was
handed. The report needs Node only: no Rust and no built core, and the recipe is not a shebang
recipe. [D]

The sections, in order [D; what each figure counts, where the designer's words leave it open, is P]:

| Section | Figures |
|---|---|
| Tool calls | Per tool: calls, accepted, refused, the most called first; then the tools never used, of the eight that run on a game. Calls after a game's end are counted here and under Refusals, and nowhere else |
| Subwarp | Accepted moves by cells moved |
| Warp | Accepted warps by distance to the nearest whole sector, with the least, median, mean and greatest energy cost |
| Blast | Accepted blasts by range to the nearest whole cell: blasts, hits, hit rate, and damage (the sum of `detail.damage`); then the same over all ranges |
| Torpedo | Accepted torpedoes by range to the nearest whole cell: count, hits, hit rate; then over all ranges |
| Per game | Sectors cleared, sectors revealed and dockings (accepted `dock`s): the total, and over the games the least, median, mean and most |
| Refusals | The reasons, most common first. Every number in a reason is replaced by `N`, so refusals that differ only in a coordinate or an amount count together |
| Looking before leaping | Of the accepted warps: how many came after an accepted long range scan, after an accepted galaxy map, after either, and after neither, each also as a share. A look counts if it came since the warp before it, or since the game's start |
| Games | Started per UTC day; ended, by outcome and by what ended them; still open; length in commands and in stardates, for ended games and for open ones; how many ended games met each number of their goals, from 0 to `GOALS_PER_GAME` |
| Energy | The lowest each game's energy ran; and for lost games, by what ended them, energy and hull after the command before the last and after the last |
| Wall-clock | The gap between consecutive commands of a game in real seconds, `new_game` being the first; how many gaps are long pauses, `LONG_PAUSE_SECONDS` or more; a game's real length, start to last command; and the same without its long pauses |
| Players and clients | Distinct player hashes; those with more than one game; those returning, with games started on more than one UTC day; games per MCP client, labelled by the declared name and version, else the `User-Agent`, else `unknown` |

A game's **played events** are every event of a game still open, and for an ended game the events
up to the command that ended it, which is its last event that took time: a call after the end is
a query or a refusal. Per game, Games, Energy and Wall-clock are summed over played events; a
game's length in commands is their count and its length in stardates the sum of their `ticks`. [P]

A length of game time is printed by the Stardate display rule's duration form, `d.dd.d`; the
report prints no clock value. [D] A length of real time is printed as `45s`, `2m 05s` or
`1h 02m 03s`, and a mean to one decimal. [P]

### Viewer socket [D]
```
on connect to /live/<view_id>:
    unknown game, or a stored game the core can't read: close with code 4404
    otherwise: add to the game's viewers, send the view frame
on an accepted command: send the view frame to the game's viewers
on any frame from a viewer: ignore it; one over VIEWER_MAX_FRAME_BYTES closes that socket (1009)

view frame = {type: "view", view: GameView of the stored game,
              achievements: [{key, label, total, reached, next} per counter, in table order]
                            of the stored game's player, as the PlayerStore has them now}
```
Both adapters enforce the size limit, which the app layer defines. [D] The achievements are
those of the player who started the game on both paths, whoever issued the command, so a
viewer sees the same list on connecting as after a command (D-49). [D] On Cloudflare the game's
object reads them from the player's object while it holds back its other requests, so a viewer
that connects during a command neither misses that command's frame nor gets an older one after
it. [P]
Every frame carries a `type`, so other kinds can join the same socket. [P]

### Events (messages)
Each event is a string in the `events` list of a Result. Only the game's caller sees it. [D]

| Event | Messages |
|---|---|
| StarbaseHail | `Starbase communication: all clear, approach for docking` · `… under attack, needs assistance` |
| Blast miss | `Blaston beam misses the enemy at (x, y)! Distance: d` |
| Shield recharge (ShieldReplenish, Warp) | `Shields recharged by n using m energy` |
| EnemyFire | `Enemy at (x, y) fires raxxon beam! Distance: d, Damage: n` + `Ship takes n damage` · `… path is blocked` |
| EnemyAdvance | `Enemy advanced from (x, y) to (x, y)` · `Enemy attempted to advance but path was blocked` |
| Game end | `The ship is destroyed` · `Every enemy in the galaxy is destroyed` · `The ship is stranded without energy to reach a starbase` |
| Emergency energy | `Starbase transfers emergency energy: n` |
| Goal met (Goal check, after the game's other events) | One wording of `objective_met`, such as `Star Central to captain: objective met. This patrol's orders called for enemies destroyed: 50, and you have delivered.` One message per goal |
| Lifetime total reaches a rung (app layer, after the core's events) | One wording of `lifetime_commendation` or `lifetime_notoriety`, such as `Star Central to captain: commendation. Your lifetime tally of enemies destroyed has reached 5000.` One message per rung |

### Client contract
- **LLM:** MCP tools and the instructions only. It holds the `game_id`, and the link it hands the captain holds only the `view_id`. [D]
- **Browser:** reads `view` from its URL, opens the game's socket, draws each frame's GameView as the current sector's
  board, the galaxy map, ship status, a survey panel (sectors charted, enemies sighted and
  starbases found, totalled from the map) and the game's goals, and reconnects after losing the
  socket. It sends nothing and never changes state. [D] It is one display: the board as a
  tilted hologram (Holotank) in the middle, with the map, ship status, survey and goals around
  it, all showing with nothing to click. [D]
  - **Objectives panel:** the game's three goals, always showing, each a gauge of its count
    against its amount; a met goal turns green and carries the word "Met", and flashes once
    when a frame first shows it met. [D] It sits under the survey on a wide screen and between
    the board and ship status on a phone. [P]
  - **Achievements panel:** the page's one control, the Achievements button in the objectives
    panel, opens a panel that scrolls inside itself and lies over the page's lower right (the
    lower screen on a phone), so opening it moves nothing. It lists every counter of the frame's
    achievements, the negative ones too: the lifetime total, the last rung reached and the next,
    and a bar of how far the total has come from the one toward the other. The counter nearest
    its next rung by that measure comes first, and equal ones keep the table's order. A counter
    whose last rung changed since the previous frame flashes once. The button again, its Close
    button or Escape closes it. [D] A viewer link ending `#achievements` opens with the panel
    showing. [P]
  - The page shows no player id and gets none. Opening and closing the panel sends nothing. [D]
- **App layer:** stores and forwards Games; it never reads or edits a Game's fields. What a
  command counted it reads from the Results' `state.counters`, and what telemetry records it
  reads from Results and the core's view. [D]

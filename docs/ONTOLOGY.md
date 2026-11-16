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
| **Sector** | One square of the galaxy, addressed `(y, x)` | quadrant |
| **Cell** | One square of a sector's 10×10 board, addressed `(y, x)` | position, space |
| **Coordinate** | `(y, x)`: row, then column, each in `0..9` | |
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
| **Frame** | One message on a viewer's socket, `{type, …}` | |

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
| `sector_yx` | Coordinate | The sector the ship is in |
| `sector` | ActiveSector | The live board of `sector_yx` |
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

The ship's cell is `ActiveSector.ship_yx`.

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
| `ship_yx` | Coordinate | |
| `starbase_yx` | Coordinate \| null | |
| `enemies_yx` | Coordinate[] | One per live enemy |
| `stars` | int | Stars placed |

Live counts are derived: `enemies = len(enemies_yx)`, `starbases = (starbase_yx ≠ null)`.

### Enemy
*Serves: F-danger.* [D] An occupant of one cell. Its only property is its position (an
entry in `enemies_yx`). All enemies are alike and have no hull: a hit either destroys one or
leaves it untouched. A torpedo always destroys it; a blast does with a chance that falls with range
(Blast).

### EnemySight
*Serves: F-danger, G-4.* [D] One enemy as the ship sees it, made in the core for every
GameState from `ship_yx` and the board, so every client reads one source. Not stored.

| Field | Type | Notes |
|---|---|---|
| `yx` | Coordinate | The enemy's cell |
| `range` | float | `euclid(ship_yx, yx)` rounded to two decimals: the distance Blast checks against `BLAST_RANGE` |
| `bearing` | int | Whole degrees clockwise from up, in `0..359`: toward row 0 is 0, right 90, down 180, left 270 [D] |
| `clear_shot` | bool | `first enemy on ray(ship_yx, yx) == yx`, the ray Blast and Torpedo use. Says nothing about range: a clear shot beyond `BLAST_RANGE` is torpedo-only |

```
dy = ship.y - yx.y;  dx = yx.x - ship.x          # up and right are positive
bearing = round(degrees(atan2(dx, dy))) mod 360
```

### Starbase
*Serves: G-4, F-discovery.* [D] An occupant of one cell (`starbase_yx`). It can't be
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

The `game_id` is random and unguessable, chosen by the app layer, and one app-layer function
hashes it to the `view_id` (D-32). The Node adapter keeps games in process memory. The
Cloudflare adapter keeps one SQLite-backed Durable Object per `view_id`, named by it. [D] The
object holds the game JSON under one key of its key-value storage. [P]

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
the last rung reached (null below the first) and the next. [D] No MCP tool returns it; it is for
the viewer, which doesn't show it yet. [D, unbuilt]

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
it from a Game and it holds only what the player has uncovered.

| Field | Type | Notes |
|---|---|---|
| `status` | playing \| won \| lost | |
| `stardate` | str | The Stardate display form |
| `sector_yx` | Coordinate | The ship's sector |
| `ship` | Ship | Every Ship field |
| `board` | str[10] | The ship's sector as map rows, the same as GameState's `map` |
| `galaxy` | 10×10 of `{enemies, starbases, stars}` or null | Null while the sector is hidden |

### Viewers
*Serves: G-3.* [D] The sockets watching each game. The app layer makes frames and calls
`publish(view_id, frame)`. Each adapter holds the sockets, because upgrading a request and
keeping a socket open belong to the platform. The Node adapter keeps a list per `view_id` in
process memory. The Cloudflare adapter keeps them on the game's Durable Object, as hibernating
WebSockets, so the object can leave memory while viewers stay connected. Its `publish` is a
call on that object, which sends the frame to each of its sockets. [D]

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
| Ship *is in* Sector (`sector_yx`) | exactly one sector |
| ActiveSector *is the live form of* the SectorRecord at `sector_yx` | 1 : 1 |
| ActiveSector *contains* Ship, Starbase, Enemy, Star | ship 1; starbase 0..1; enemies 0..`ENEMY_MAX_PER_SECTOR`; stars per record |
| Cell *holds* occupant | 0..1 |
| Game *is watched by* Viewer | 1 → 0..n |

## 4. Invariants

- Every coordinate is in `0..9`. [D]
- Each cell holds at most one occupant. Exactly one cell is `S`, and it is `ship_yx`. [D]
- Each `enemies_yx` entry is an `E` cell, and every `E` cell is in `enemies_yx`. [D]
- `galaxy[sector_yx].enemies == len(sector.enemies_yx)` after every command. Positions are
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
  use owns its indices: a **sector stream** `sector_rng(seed, sector_yx)` per sector, so a
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
ship = full;  sector_yx = GALAXY_CENTER;  sector = instantiate(GALAXY_CENTER)
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
r = sector_rng(seed, sector_yx);  map = all '.'
place the starbase (if any), then each star, then each live enemy, then the ship,
each on a cell drawn from r among the empty cells
```
Drawing among the empty cells always succeeds: a board holds at most 19 occupants. [P]
Terrain is placed before enemies, so a sector's stars and starbase are the same on every
visit, and its enemies stand where the first of the original enemies stood.

### Warp — *Serves: G-2, F-discovery* [D]
```
illegal if target == sector_yx
time = round(WARP_TIME_K × ln(euclid(sector_yx, target) + 1));  cost = time × WARP_ENERGY_PER_TICK
illegal if energy < cost
if enemies are present: run EnemiesTurn;  if hull == 0: end game, stop
energy -= cost;  startick += time
recharge(max_shields)      # the Shield recharge rule: to full, as far as the energy left allows [D]
reveal(target);  sector_yx = target;  sector = instantiate(target);  last_event_startick = startick
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
r = ray(ship_yx, dest), dropping a final obstacle;  steps = min(len(r) − 1, limit)
illegal if steps == 0;  illegal if energy < steps × SUBWARP_ENERGY_PER_STEP
ship_yx = r[steps];  energy -= steps × SUBWARP_ENERGY_PER_STEP
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
for each sector in the 3×3 block around sector_yx: reveal it, report "E|B|S"; off-galaxy → "....."
startick += LRS_TIME [T]
run stardate events      # enemies present act; in a cleared sector the clock still advances, no one acts [D]
```

### Blast — *Serves: F-danger, G-4* [D]
```
hit = first enemy on ray(ship_yx, target);  illegal if none
r = euclid(ship_yx, hit);  illegal if r > BLAST_RANGE
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
hit = first enemy on ray(ship_yx, target);  illegal if none
destroy hit;  quantorpedoes -= 1;  counters.torpedoes_fired += 1
energy -= TORPEDO_ENERGY;  startick += TORPEDO_TIME
run stardate events
```

### Destroy enemy — *Serves: F-danger* [D]
```
remove from enemies_yx and map;  galaxy[sector_yx].enemies = len(enemies_yx)
counters.enemies_destroyed += 1;  if enemies_yx is empty: counters.sectors_cleared += 1
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
than `sector_yx` (infinite if there is none), by the Warp rule's `cost`. Outside Star
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
for each enemy in enemies_yx order:
  EnemyAdvance with probability ENEMY_ADVANCE_FRACTION (from rng), else EnemyFire
```

### EnemyAdvance — *Serves: F-danger* [D]
```
roll = rng.unit()    # one draw per advance
approach = left if roll < ENEMY_OBLIQUE_CHANCE/2, right if roll ≥ 1 − ENEMY_OBLIQUE_CHANCE/2, else head-on [D]
head-on:  r = ray(enemy, ship_yx);  dest = r[min(ENEMY_ADVANCE_STEPS, len(r) − 1)]
oblique [P]:  repeat ENEMY_ADVANCE_STEPS times from `at`:
                head = ray(at, ship_yx)[1];  side = at + (head − at) turned one octant left or right
                next = head if euclid(side, ship_yx) > euclid(at, ship_yx) else side
                if next is not empty: stay (no fallback)
                at = next
              dest = at
if dest is empty: move enemy to dest   else: stay
```

### EnemyFire — *Serves: F-danger* [D]
```
if ray(enemy, ship_yx) doesn't end at ship_yx: no effect
factor = uniform(rng, ENEMY_FIRE_VARIANCE_MIN..ENEMY_FIRE_VARIANCE_MAX)      # one draw per shot, blocked or not
d = euclid(enemy, ship_yx)
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
          store new_game(seed, the adapter's clock in Unix seconds) under view_id
any other tool: load sha256(game_id), else error "Game not found"
                a stored game the core can't read is not found too
apply the command;  if refused: return the result
store the returned game, publish its view frame to the viewers
append the Lifetime totals rule's messages to the result's events;  return the result
```
`new_game` answers with the core's state query on the new game, and its report carries the
`game_id`, the goals as that state shows them, and the viewer's link. A command's events are in
this order: the game's own, then any goal met (Goal check, from the core), then any lifetime
message (from the app layer). [D]

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
| `galaxy_warp` | `y, x` | action | Warp | `{sector_yx, energy_cost, time}` |
| `subwarp` | `y, x` | action | Subwarp | `{ship_yx, path, energy_cost, time}` |
| `dock` | — | action | Dock | `{time}` |
| `long_range_scan` | — | action | Long-range scan | `{scan: string[3], energy_cost, time}` |
| `blast` | `y, x` | action | Blast | `{hit_yx, path, destroyed, energy_cost, time}` |
| `torpedo` | `y, x` | action | Torpedo | `{hit_yx, path, destroyed, energy_cost, time}`; `destroyed` is always true |

`galaxy_map` rows are 10 space-separated entries: visible `E|B|S`, hidden `.....`.
Every `time` is how long the action took, as a string in the duration form of the Stardate
display rule. [D]

**GameState:** `status, sector_yx, ship_yx, ship_hull, ship_max_hull, ship_shields,
ship_max_shields, ship_energy, ship_max_energy, ship_quantorpedoes,
ship_max_quantorpedoes, starbase_yx, enemies: EnemySight[], star_count, base_count, enemy_count,
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

No tool returns a player's lifetime totals or achievements [D]: a player sees them only on the
viewer. [D, unbuilt: the viewer page doesn't show them yet] They reach the conversation one at a time, as Star Central's message in the `events`
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
| `GET /` | The home page: a short briefing with how to connect (D-40). Cloudflare redirects `/index.html` to `/` [P] |
| `GET /viewer` | The viewer page. `?view=<view_id>` chooses the game. Cloudflare redirects `/viewer.html` to `/viewer` [P]. With no game, its notice links to `/` |
| `GET /css/styles.css`, `GET /css/home.css`, `GET /js/script.js`, `GET /fonts/oxanium.woff2`, `GET /images/viewer.jpg` | The pages' files |
| WebSocket `/live/<view_id>` | The game's frames, read-only [P] |
| any other path | 404 |

The app layer serves `/mcp` and `/health` as one fetch handler. MCP over HTTP is stateless:
each request gets a fresh MCP server, and games live in the GameStore. [P] Adapters serve the
pages and the socket. The Node adapter serves all of these in both modes, and in stdio mode
also serves MCP over stdio, from one process that holds the games. It takes `--host` and
`--port` to bind and `--origin` for where browsers reach it. A stdio process that finds the
port held by a Starreach server forwards its MCP messages there instead, so one process still
holds every client's games, and refuses to start if anything else holds it. A stdio process
exits when its client closes stdin, which ends the games it holds. [P]

The Cloudflare adapter is a Worker that serves `/mcp` and `/health` through the app layer's
handler, and takes the viewer link's origin from the request. [D] It keeps each player's lifetime
totals in the Durable Object named by the player's `sub` (PlayerStore). [D] `/mcp` serves only a signed-in
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

### Viewer socket [D]
```
on connect to /live/<view_id>:
    unknown game, or a stored game the core can't read: close with code 4404
    otherwise: add to the game's viewers, send {type: "view", view: GameView}
on an accepted command: send {type: "view", view: GameView} to the game's viewers
on any frame from a viewer: ignore it; one over VIEWER_MAX_FRAME_BYTES closes that socket (1009)
```
Both adapters enforce the size limit, which the app layer defines. [D]
Every frame carries a `type`, so other kinds can join the same socket. [P]

### Events (messages)
Each event is a string in the `events` list of a Result. Only the game's caller sees it. [D]

| Event | Messages |
|---|---|
| StarbaseHail | `Starbase communication: all clear, approach for docking` · `… under attack, needs assistance` |
| Blast miss | `Blaston beam misses the enemy at (y, x)! Distance: d` |
| Shield recharge (ShieldReplenish, Warp) | `Shields recharged by n using m energy` |
| EnemyFire | `Enemy at (y, x) fires raxxon beam! Distance: d, Damage: n` + `Ship takes n damage` · `… path is blocked` |
| EnemyAdvance | `Enemy advanced from (a) to (b)` · `Enemy attempted to advance but path was blocked` |
| Game end | `The ship is destroyed` · `Every enemy in the galaxy is destroyed` · `The ship is stranded without energy to reach a starbase` |
| Emergency energy | `Starbase transfers emergency energy: n` |
| Goal met (Goal check, after the game's other events) | One wording of `objective_met`, such as `Star Central to captain: objective met. This patrol's orders called for enemies destroyed: 50, and you have delivered.` One message per goal |
| Lifetime total reaches a rung (app layer, after the core's events) | One wording of `lifetime_commendation` or `lifetime_notoriety`, such as `Star Central to captain: commendation. Your lifetime tally of enemies destroyed has reached 5000.` One message per rung |

### Client contract
- **LLM:** MCP tools and the instructions only. It holds the `game_id`, and the link it hands the captain holds only the `view_id`. [D]
- **Browser:** reads `view` from its URL, opens the game's socket, draws each frame's GameView as the current sector's
  board, the galaxy map, ship status and a survey panel (sectors charted, enemies sighted and
  starbases found, totalled from the map), and reconnects after losing the socket. It sends
  nothing and never changes state. [D] It is one display with nothing to click: the board as a
  tilted hologram (Holotank) in the middle, with the map, ship status and survey around it. [D]
- **App layer:** stores and forwards Games; it never reads or edits a Game's fields. What a
  command counted it reads from the Results' `state.counters`. [D]

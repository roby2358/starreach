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
| **Stardate** | Game time | |
| **Command** | A request to the core: an action or a query | order |
| **Action** | A command that changes state | |
| **Query** | A command that only reads state | |
| **Event** | Something the game does in response to an action, reported as a message | |
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
| `stardate` | float | Current game time |
| `last_event_stardate` | float | Stardate when stardate events last ran, or when the ship entered the sector |

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
| Game *has* Galaxy, Ship, ActiveSector | 1 → 1 each |
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
- `stardate` never decreases. [D]
- `0 ≤ shields ≤ max_shields`, `0 ≤ hull ≤ max_hull`, `0 ≤ energy ≤ max_energy`,
  `0 ≤ quantorpedoes ≤ max_quantorpedoes`. [D]
- `status` leaves `playing` at most once, and never returns. [D]
- A refused command returns the game unchanged. [D]
- Games are isolated: a command on one never changes another. [D]
- Same seed and same commands give the same state. [D]
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

### Distances
`euclid(a, b)` sets ranges and costs. `chebyshev(a, b) ≤ 1` defines *adjacent*. [D]

### Random streams
*Serves: G-2, F-discovery.* [D] Two kinds of stream, both deterministic:
- **The game stream** `rng`, seeded from `seed` at creation and carried in the Game. Galaxy
  generation, `STARDATE_START`, enemy choices, blast kill rolls and enemy fire damage draw from it.
- **A sector stream** `sector_rng(seed, sector_yx)`, fresh each time a sector is built, so a
  sector's layout depends only on the seed, the sector and its record.

---

## 6. Rules

Every action first checks, in this order: `status == playing`; any coordinate argument is
in `0..9`; then its own legality. A failed check refuses the action: `ok = false`, an
`error` message, and the game unchanged. [D]

### Game creation — *Serves: G-2* [D]
```
rng = seeded(seed);  galaxy = generate(rng);  stardate = uniform(rng, STARDATE_START)
ship = full;  sector_yx = GALAXY_CENTER;  sector = instantiate(GALAXY_CENTER)
last_event_stardate = stardate;  status = playing
```

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
distance = int(euclid(sector_yx, target) × WARP_DISTANCE_SCALE);  cost = distance × WARP_ENERGY_PER_DISTANCE
illegal if energy < cost
if enemies are present: run EnemiesTurn;  if hull == 0: end game, stop
mark target visible;  energy -= cost;  stardate += distance × WARP_TIME_PER_DISTANCE
sector_yx = target;  sector = instantiate(target);  last_event_stardate = stardate
ambush: for each enemy in order, while hull > 0: with probability ENEMY_AMBUSH_CHANCE it fires once (the EnemiesTurn fire rule) [D]
run warp events
```

### Subwarp — *Serves: G-2, F-danger* [D]
```
limit = SUBWARP_MAX_STEPS_HOSTILE if enemies are present else SUBWARP_MAX_STEPS
r = ray(ship_yx, dest), dropping a final obstacle;  steps = min(len(r) − 1, limit)
illegal if steps == 0;  illegal if energy < steps × SUBWARP_ENERGY_PER_STEP
ship_yx = r[steps];  energy -= steps × SUBWARP_ENERGY_PER_STEP
stardate += steps × SUBWARP_TIME_PER_STEP;  run stardate events
```

### Dock — *Serves: G-4* [D]
```
illegal if enemies are present, or no starbase, or starbase not adjacent
hull, shields, energy, quantorpedoes := max;  stardate += DOCK_TIME
run stardate events
```

### Long-range scan — *Serves: F-discovery, F-danger* [D]
```
illegal if energy < LRS_ENERGY
energy -= LRS_ENERGY
for each sector in the 3×3 block around sector_yx: mark visible, report "E|B|S"; off-galaxy → "....."
stardate += LRS_TIME [T]
run stardate events      # enemies present act; in a cleared sector the stardate still advances, no one acts [D]
```

### Blast — *Serves: F-danger, G-4* [D]
```
hit = first enemy on ray(ship_yx, target);  illegal if none
r = euclid(ship_yx, hit);  illegal if r > BLAST_RANGE
cost = int(BLAST_ENERGY_BASE × √r);  illegal if energy < cost
destroyed = rng.unit() < kill_chance(r)      # one draw per blast [D]
if destroyed: destroy hit   else: report the miss (the enemy is untouched)
energy -= cost;  stardate += int(BLAST_TIME_A + BLAST_TIME_B × √r)      # paid hit or miss [D]
run stardate events

kill_chance(r):
  r ≤ BLAST_SURE_RANGE: BLAST_KILL_CHANCE_NEAR
  otherwise: BLAST_KILL_CHANCE_NEAR × (BLAST_KILL_CHANCE_FAR / BLAST_KILL_CHANCE_NEAR) ^ ((r − BLAST_SURE_RANGE) / (BLAST_RANGE − BLAST_SURE_RANGE)) [D]
```

### Torpedo — *Serves: F-danger, G-4* [D]
```
illegal if quantorpedoes == 0, or energy < TORPEDO_ENERGY
hit = first enemy on ray(ship_yx, target);  illegal if none
destroy hit;  quantorpedoes -= 1;  energy -= TORPEDO_ENERGY;  stardate += TORPEDO_TIME
run stardate events
```

### Destroy enemy — *Serves: F-danger* [D]
```
remove from enemies_yx and map;  galaxy[sector_yx].enemies = len(enemies_yx)
```

### Stardate events — *Serves: F-danger* [D]
```
if stardate − last_event_stardate < EVENT_INTERVAL: stop
for e in [ShieldReplenish, EnemiesTurn]: if e.can_occur: messages += e.execute
last_event_stardate = stardate
```

### Game end — *Serves: G-2, F-danger* [D]
Runs after every accepted action.
```
if hull == 0: status = lost
else if the sum of galaxy enemies == 0: status = won
else if stranded and a starbase is present: energy = max(energy, STARBASE_EMERGENCY_ENERGY)
else if stranded: status = lost
```
*Stranded* [P]: energy is below the warp cost to the nearest visible starbase sector other
than `sector_yx` (infinite if there is none). Outside Star Central, Star Central is always
that fallback, and `STARBASE_EMERGENCY_ENERGY` covers the longest warp to it.

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
```

### ShieldReplenish — *Serves: F-danger, G-4* [D]
```
can_occur: shields < max_shields and energy ≥ SHIELD_ENERGY_PER_POINT
amount = min(SHIELD_REPLENISH, max_shields − shields, energy ÷ SHIELD_ENERGY_PER_POINT)
shields += amount;  energy -= amount × SHIELD_ENERGY_PER_POINT
```

### StarbaseHail — *Serves: F-command, F-discovery* [D]
```
can_occur: a starbase is present
message: "all clear, approach for docking" if no enemies else "under attack, needs assistance"
```

### Stardate display — *Serves: F-command* [D]
```
s = int(stardate) zero-padded to 8 digits, first 8 kept;  shown as s[0:2]-s[2:6]-s[6:8]
```

### Game lookup — *Serves: G-1* [D]
In the app layer.
```
new_game: seed = random u32;  game_id = random id;  view_id = sha256(game_id);  store new_game(seed) under view_id
any other tool: load sha256(game_id), else error "Game not found"
apply the command;  if ok: store the returned game, publish its view frame to the viewers
return the result
```

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
| `WARP_DISTANCE_SCALE` | 10 | distance per sector | D-5 |
| `WARP_ENERGY_PER_DISTANCE` | 10 | energy | D-5 |
| `WARP_TIME_PER_DISTANCE` | 0.01 | stardate | D-5 |
| `SUBWARP_MAX_STEPS` | 10 | cells | D-6 |
| `SUBWARP_MAX_STEPS_HOSTILE` | 3 | cells | D-6 |
| `SUBWARP_ENERGY_PER_STEP` | 2 | energy | D-6 |
| `SUBWARP_TIME_PER_STEP` | 1 | stardate | D-6 |
| `DOCK_TIME` | 5 | stardate | D-7 |
| `LRS_ENERGY` | 500 | energy | D-8 |
| `LRS_TIME` | 3 | stardate | D-8 |
| `BLAST_RANGE` | 9 | cells; also where the kill chance reaches `BLAST_KILL_CHANCE_FAR` | D-9, D-36 |
| `BLAST_SURE_RANGE` | 4 | cells, up to which a blast kills with `BLAST_KILL_CHANCE_NEAR` | D-36 |
| `BLAST_KILL_CHANCE_NEAR` | 0.9 | probability a blast kills, up to `BLAST_SURE_RANGE` | D-36 |
| `BLAST_KILL_CHANCE_FAR` | 0.1 | probability a blast kills at `BLAST_RANGE` | D-36 |
| `BLAST_ENERGY_BASE` | 1000 | energy per √cell | D-9 |
| `BLAST_TIME_A` | −0.37840 | stardate | D-9 |
| `BLAST_TIME_B` | 1.37840 | stardate per √cell | D-9 |
| `TORPEDO_ENERGY` | 100 | energy | D-9 |
| `TORPEDO_TIME` | 1 | stardate | D-9 |
| `EVENT_INTERVAL` | 3 | stardate | D-10 |
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
| `STARDATE_START` | 1000000..2000000 | stardate | D-12 |
| `SHIELD_REPLENISH` | 500 | hp per firing | D-27 |
| `SHIELD_ENERGY_PER_POINT` | 1 | energy per hp | D-27 |
| `STARBASE_EMERGENCY_ENERGY` | 1000 | energy floor a starbase restores to a stranded ship | D-30 |
| `HTTP_PORT` | 8572 | port the `just` recipes pass to the local servers | D-21 |
| `RECONNECT_MIN_MS` | 1000 | ms a viewer page waits before its first reconnect; it doubles after each failure | D-31 |
| `RECONNECT_MAX_MS` | 15000 | ms, the longest a viewer page waits to reconnect | D-31 |
| `VIEWER_MAX_FRAME_BYTES` | 128 | largest frame a viewer may send before its socket closes; room for a ping or a small view setting | D-31 |
| `LOW_GAUGE_FRACTION` | 0.25 | share of its maximum below which a page gauge turns red | D-31 |

---

## 8. Interface

### Core API (Rust → WASM) [D]
Three JSON functions. The core holds no state between calls.

| Function | Input | Output |
|---|---|---|
| `new_game` | `seed: u32` | Game |
| `apply` | `game: Game`, `command: Command` | `{game: Game, result: Result}` |
| `view` | `game: Game` | GameView |

`Game` is opaque to the app layer. 64-bit fields inside it are serialized as strings so a
JavaScript round trip can't lose precision.

### Commands
Each command is `{type, …args}`. Every command returns the same **Result** shape:
`{ok: bool, error: string | null, events: string[], report: object | null, state: GameState}`.
`report` is the command's own data when `ok`, and null when refused. [D]

| Command `type` | Args | Kind | Rule | `report` |
|---|---|---|---|---|
| `state` | — | query | — | null |
| `galaxy_map` | — | query | — | `{map: string[10]}` |
| `galaxy_warp` | `y, x` | action | Warp | `{sector_yx, distance, energy_cost, time}` |
| `subwarp` | `y, x` | action | Subwarp | `{ship_yx, path, energy_cost, time}` |
| `dock` | — | action | Dock | `{time}` |
| `long_range_scan` | — | action | Long-range scan | `{scan: string[3], energy_cost, time}` |
| `blast` | `y, x` | action | Blast | `{hit_yx, path, destroyed, energy_cost, time}` |
| `torpedo` | `y, x` | action | Torpedo | `{hit_yx, path, destroyed, energy_cost, time}`; `destroyed` is always true |

`galaxy_map` rows are 10 space-separated entries: visible `E|B|S`, hidden `.....`.

**GameState:** `status, sector_yx, ship_yx, ship_hull, ship_max_hull, ship_shields,
ship_max_shields, ship_energy, ship_max_energy, ship_quantorpedoes,
ship_max_quantorpedoes, starbase_yx, enemies: EnemySight[], star_count, base_count, enemy_count,
map: string[10], stardate: "99-9999-99"`.

### MCP tools (app layer) [D]
One tool per core command, each taking `game_id` plus the command's args, and returning
the core Result. Plus:

| Tool / prompt | Args | Returns |
|---|---|---|
| `new_game` | — | Result with `report: {game_id, viewer_url}`. `viewer_url` is the viewer's link, `<origin>/viewer?view=<view_id>`; it never holds the `game_id` [D] |
| prompt `instructions` | — | The decorum and rendering instructions for the LLM, which `initialize` also returns as the server's instructions |

The instructions reach the LLM as soon as its client connects, since `initialize` returns them;
most clients load a prompt only when the user picks it. They cast it as the ship's computer,
working closely with the captain to make the galaxy safe, and tell it to give the captain the
`viewer_url` and then wait for orders rather than play on its own [D]. Facts about one tool go in
that tool's description: `subwarp`'s states the Subwarp rule's hostile-sector cap, so a move that
stops short isn't a surprise [D].

An unknown `game_id` returns `{ok: false, error: "Game not found", …}` with `state` null.
Arguments that don't fit a tool's schema, such as a missing `game_id` or a coordinate that
isn't an integer, are rejected by MCP as a tool error and never reach the game. An integer
coordinate outside `0..9` does reach the core, which refuses it with a Result. [P]

### HTTP (adapters) [D]

| Route | Returns |
|---|---|
| `POST /mcp` | Streamable-HTTP MCP |
| `GET /health` | `{status: "ok"}` |
| `GET /` | The home page: a short briefing with how to connect (D-40). Cloudflare redirects `/index.html` to `/` [P] |
| `GET /viewer` | The viewer page. `?view=<view_id>` chooses the game. Cloudflare redirects `/viewer.html` to `/viewer` [P]. With no game, its notice links to `/` |
| `GET /css/styles.css`, `GET /css/home.css`, `GET /js/script.js`, `GET /fonts/oxanium.woff2` | The pages' files |
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
handler, and takes the viewer link's origin from the request. [D] Before `/mcp` it calls an auth
seam, which allows every request until auth exists (Q-15). [D] `/health` doesn't pass through
the seam, and the seam answers with the response that refuses a request, or nothing to let it
through. [P] Locally it runs under `wrangler dev` (`just cf-dev`). Its production environment
is routed to `starreach.yuwakisa.com` (D-20) and deployed there with `just cf-deploy`. [D]

The Worker calls the same seam before a viewer's socket upgrade, then hands the upgrade to the
Durable Object named by the path's `view_id`. [D] A `/live/` request that isn't a WebSocket
upgrade, or whose id isn't a `view_id`, gets the 404 of any other path. [P] The pages are
`public/` served as Workers static assets: a request that matches a file is answered without
running the Worker, and every other request reaches it. [D] `public/.assetsignore` keeps
`instructions.txt` out of the assets, since the Worker bundles it as a module; everything else
in `public/` is served, which adds the font's licence text to the pages' files. [P]

### Viewer socket [D]
```
on connect to /live/<view_id>:
    unknown game: close with code 4404
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
| ShieldReplenish | `Shields recharged by n using n energy` |
| EnemyFire | `Enemy at (y, x) fires raxxon beam! Distance: d, Damage: n` + `Ship takes n damage` · `… path is blocked` |
| EnemyAdvance | `Enemy advanced from (a) to (b)` · `Enemy attempted to advance but path was blocked` |
| Game end | `The ship is destroyed` · `Every enemy in the galaxy is destroyed` · `The ship is stranded without energy to reach a starbase` |
| Emergency energy | `Starbase transfers emergency energy: n` |

### Client contract
- **LLM:** MCP tools and the instructions only. It holds the `game_id`, and the link it hands the captain holds only the `view_id`. [D]
- **Browser:** reads `view` from its URL, opens the game's socket, draws each frame's GameView as the current sector's
  board, the galaxy map, ship status and a survey panel (sectors charted, enemies sighted and
  starbases found, totalled from the map), and reconnects after losing the socket. It sends
  nothing and never changes state. [D] It is one display with nothing to click: the board as a
  tilted hologram (Holotank) in the middle, with the map, ship status and survey around it. [D]
- **App layer:** stores and forwards Games; it never reads or edits a Game's fields. [D]

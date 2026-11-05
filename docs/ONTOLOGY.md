# Starreach — Ontology

The implementation reference for Starreach: what exists, what each thing carries, how
things relate, the rules that change them, and the interface to them. It states the
current design only. Reasons and open questions are in RATIONALE.md, checks are in
CRITERIA.md, history is in ARCHITECTURE_LOG.md, and why it's fun is in DYNAMICS.md.

**Tags.** **[D]** decided by the designer · **[P]** proposed by Claude, pending review ·
**[T]** tunable (see Numbers) · **[D, unbuilt]** decided but not in the code.
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
- **F-danger** — Enemies fight back, so position and timing matter. [P]

### Goals (priority order)
- **G-1 Playable entirely through an LLM conversation.** Every player action and every
  piece of state the player needs is an MCP tool or prompt. Results carry enough for the
  LLM to narrate. [D]
- **G-2 Search and battle across a galaxy.** Warp between sectors, maneuver within one,
  destroy enemies, resupply at starbases. [D]
- **G-3 The browser shows the game being played.** The page shows the session the LLM
  is playing. [D, unbuilt]
- **G-4 Resources force choices.** Energy, quantorpedoes, shields and hull are finite.
  Starbases are rare. [P]

### Priorities when goals conflict
G-1 > G-2 > G-4 > G-3. [P]

### Non-goals (for now)
Multiplayer [D]. Persistence across a server restart [P]. Playing through the browser [D].

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
| **Action** | A player command that changes state | |
| **Event** | Something the game does in response to an action, reported as a message | |
| **Session** | One game, addressed by `session_id` | |

---

## 2. Entities

### Game (world)
*Serves: G-2.* [D]

| Field | Type | Notes |
|---|---|---|
| `galaxy` | Galaxy | |
| `ship` | Ship | |
| `sector_yx` | Coordinate | The sector the ship is in |
| `sector` | ActiveSector | The live board of `sector_yx` |
| `stardate` | float | Current game time |
| `last_action_stardate` | float | Stardate after the previous action; the event clock reads it |
| `stardate_event_types` | Event[] | `[ShieldReplenish, EnemiesTurn]`, in order |
| `warp_event_types` | Event[] | `[StarbaseHail]` |

### Ship
*Serves: G-4, F-danger.* [D] There is exactly one ship, the player's.

| Field | Type | Notes |
|---|---|---|
| `hull`, `max_hull` | number | Takes damage after shields are gone |
| `shields`, `max_shields` | number | Takes damage first |
| `energy`, `max_energy` | int | Spent by actions |
| `quantorpedoes`, `max_quantorpedoes` | int | Spent by torpedoes |

The ship's cell is `ActiveSector.ship_yx`.

### Galaxy
*Serves: G-2, F-discovery.* [D]

| Field | Type | Notes |
|---|---|---|
| `galaxy` | SectorRecord[10][10] | Indexed `[y][x]` |
| `center_yx` | Coordinate | `GALAXY_CENTER`; the starting sector ("Star Central") |

### SectorRecord
*Serves: F-discovery.* [D] What the galaxy remembers about a sector: counts, not layout.

| Field | Type | Notes |
|---|---|---|
| `visible` | bool | Whether the player may see the counts |
| `enemies` | int | |
| `starbases` | int | 0 or 1 |
| `stars` | int | |

### ActiveSector
*Serves: G-2, F-danger.* [D] The tactical board for the sector the ship is in. It is
created from a SectorRecord when the ship arrives and discarded when it leaves.

| Field | Type | Notes |
|---|---|---|
| `stars`, `starbases`, `enemies` | int | Live counts |
| `map` | char[10][10] | `.` empty · `S` ship · `B` starbase · `E` enemy · `*` star |
| `ship_yx` | Coordinate | |
| `starbase_yx` | Coordinate \| none | |
| `enemies_yx` | Coordinate[] | One per live enemy |

### Enemy
*Serves: F-danger.* [D] An occupant of one cell. Its only property is its position (an
entry in `enemies_yx`). All enemies are alike, and one hit destroys one.

### Starbase
*Serves: G-4, F-discovery.* [D] An occupant of one cell (`starbase_yx`). It can't be
destroyed. It is an obstacle and the only source of resupply.

### Star
*Serves: F-danger.* [P] An occupant of one cell, recorded only on `map`. It is an obstacle
and can't be destroyed.

### Event
*Serves: G-1, F-danger.* [D] One template: `can_occur(game) → bool` and
`execute(game) → message[]`. Kinds: **StarbaseHail**, **ShieldReplenish**, **EnemiesTurn**.
EnemiesTurn is made up of per-enemy **EnemyFire** and **EnemyAdvance**
(`execute_one(game, enemy_yx) → message[]`).

### Session and SessionRegistry
*Serves: G-1.* [D]

| Field | Type | Notes |
|---|---|---|
| Session.`session_id` | str | UUID4, or `"default"` |
| Session.`game` | Game | |
| SessionRegistry.`sessions` | map str → Session | In memory, process-wide; no removal |

### Agents
- **Enemies** act only inside EnemiesTurn. They know the ship's cell exactly and follow the
  same Ray rule as the ship. Their action (fire or advance) is assigned at random each
  turn, with no memory. [D]
- **The LLM** isn't a game actor. It is the player's interface: it sees what the tools
  return and follows the `instructions` prompt for decorum and rendering. [D]

---

## 3. Relations

| Relation | Cardinality |
|---|---|
| SessionRegistry *has* Session | 1 → 0..n |
| Session *has* Game | 1 → 1 |
| Game *has* Galaxy, Ship, ActiveSector | 1 → 1 each |
| Galaxy *has* SectorRecord | 1 → 100 |
| Ship *is in* Sector (`sector_yx`) | n:1, exactly one sector |
| ActiveSector *is the live form of* the SectorRecord at `sector_yx` | 1 : 1 |
| ActiveSector *contains* Ship, Starbase, Enemy, Star | ship 1; starbase 0..1; enemies 0..`ENEMY_MAX_PER_SECTOR`; stars per record |
| Cell *holds* occupant | 0..1 |

## 4. Invariants

- Every coordinate is in `0..9`. [D]
- Each cell holds at most one occupant. Exactly one cell is `S`, and it is `ship_yx`. [D]
- `len(enemies_yx) == enemies`, and each `enemies_yx` entry is an `E` cell. [D]
- After a kill, `galaxy[sector_yx].enemies == sector.enemies`. Positions are never stored in
  the galaxy. [D]
- The `GALAXY_CENTER` record starts as `(visible, 0, 1, START_SECTOR_STARS)`. [D]
- `visible` only goes from false to true. [D]
- `stardate` never decreases. [D]
- `0 ≤ shields ≤ max_shields`, `0 ≤ hull ≤ max_hull`, `0 ≤ quantorpedoes ≤ max_quantorpedoes`. [D]
- `energy ≤ max_energy`. Energy has no lower bound. [D]
- Sessions are isolated: an action on one never changes another. [D]
- Same seed and same actions give the same state. [P]

---

## 5. Geometry

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

---

## 6. Rules

### Galaxy generation — *Serves: G-2, F-discovery* [D]
```
center:     (visible, 0, 1, START_SECTOR_STARS)
otherwise:  f = ENEMY_DISTANCE_FLOOR + euclid(s, GALAXY_CENTER)/ENEMY_DISTANCE_NORM × ENEMY_DISTANCE_SCALE
            enemies   = clamp(int(f × uniform(ENEMY_BASE_ROLL)), 0, ENEMY_MAX_PER_SECTOR)
            starbases = 1 with probability STARBASE_CHANCE, else 0
            stars     = uniform(STARS_PER_SECTOR);  visible = false
```

### Sector instantiation — *Serves: G-2* [D]
```
map = all '.'
place ship, starbase (if any), each enemy, each star, in that order,
each on a random empty cell; give up after PLACEMENT_ATTEMPTS tries
```

### Warp — *Serves: G-2, F-discovery* [D]
```
illegal if target off-galaxy or distance == 0  → no change
mark target visible
distance = int(euclid(sector_yx, target) × WARP_DISTANCE_SCALE)
energy -= distance × WARP_ENERGY_PER_DISTANCE;  stardate += distance × WARP_TIME_PER_DISTANCE
sector_yx = target;  sector = instantiate(record);  last_action_stardate = stardate
run warp events
```

### Subwarp — *Serves: G-2, F-danger* [D]
```
limit = SUBWARP_MAX_STEPS_HOSTILE if enemies > 0 else SUBWARP_MAX_STEPS
r = ray(ship_yx, dest), dropping a final obstacle;  steps = min(len(r) − 1, limit)
ship_yx = r[steps];  energy -= steps × SUBWARP_ENERGY_PER_STEP
stardate += steps × SUBWARP_TIME_PER_STEP;  run stardate events
```

### Dock — *Serves: G-4* [D]
```
illegal if enemies > 0, or no starbase, or starbase not adjacent  → no change
shields, energy, quantorpedoes := max;  stardate += DOCK_TIME
run stardate events
```

### Long-range scan — *Serves: F-discovery* [D]
```
illegal if energy < LRS_ENERGY  → no change
energy -= LRS_ENERGY
for each sector in the 3×3 block around sector_yx: mark visible, report "E|B|S"; off-galaxy → "....."
run stardate events
```

### Blast — *Serves: F-danger, G-4* [D]
```
r = euclid(ship_yx, target);  illegal if r > BLAST_RANGE
hit = first enemy on ray(ship_yx, target);  illegal if none
destroy hit;  energy = max(0, energy − int(BLAST_ENERGY_BASE × √r))
stardate += int(BLAST_TIME_A + BLAST_TIME_B × √r);  run stardate events
```

### Torpedo — *Serves: F-danger, G-4* [D]
```
illegal if quantorpedoes == 0
hit = first enemy on ray(ship_yx, target);  illegal if none
destroy hit;  quantorpedoes -= 1;  energy = max(0, energy − TORPEDO_ENERGY)
stardate += TORPEDO_TIME;  run stardate events
```

### Destroy enemy — *Serves: F-danger* [D]
```
remove from enemies_yx and map;  enemies -= 1;  galaxy[sector_yx] counts := sector counts
```

### Stardate events — *Serves: F-danger* [D]
```
if stardate − last_action_stardate ≥ EVENT_INTERVAL:
  for e in stardate_event_types: if e.can_occur: messages += e.execute
last_action_stardate = stardate
```

### EnemiesTurn — *Serves: F-danger* [D]
```
can_occur: enemies > 0
n_adv = int(enemies × ENEMY_ADVANCE_FRACTION);  n_fire = enemies − n_adv
shuffle the actions and pair them one-to-one with enemies_yx;  each enemy acts once
```

### EnemyAdvance — *Serves: F-danger* [D]
```
r = ray(enemy, ship_yx);  dest = r[min(ENEMY_ADVANCE_STEPS, len(r) − 1)]
if dest is empty: move enemy to dest   else: stay
```

### EnemyFire — *Serves: F-danger* [D]
```
if ray(enemy, ship_yx) doesn't end at ship_yx: no effect
damage = ENEMY_FIRE_BASE × (1 / euclid(enemy, ship_yx)) ^ ENEMY_FIRE_FALLOFF
shields absorb up to their value; hull absorbs the rest up to its value
```

### ShieldReplenish — *Serves: F-danger* [D, unbuilt]
```
can_occur: shields < max_shields
effect: shields rise (amount undecided); today it reports a message only
```

### StarbaseHail — *Serves: F-command, F-discovery* [D]
```
can_occur: starbases > 0
message: "all clear, approach for docking" if enemies == 0 else "under attack, needs assistance"
```

### Stardate display — *Serves: F-command* [D]
```
s = int(stardate) zero-padded to 8 digits, first 8 kept;  shown as s[0:2]-s[2:6]-s[6:8]
```

### Session lookup — *Serves: G-1* [D]
```
create_game: new Session(uuid4)
any other tool: Session for session_id, else error "Game session not found"
GET /state: the Session "default", created on first use
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
| `STARBASE_CHANCE` | 0.02 | per sector | D-4 |
| `PLACEMENT_ATTEMPTS` | 100 | tries | — |
| `WARP_DISTANCE_SCALE` | 10 | distance per sector | D-5 |
| `WARP_ENERGY_PER_DISTANCE` | 10 | energy | D-5 |
| `WARP_TIME_PER_DISTANCE` | 0.01 | stardate | D-5 |
| `SUBWARP_MAX_STEPS` | 10 | cells | D-6 |
| `SUBWARP_MAX_STEPS_HOSTILE` | 3 | cells | D-6 |
| `SUBWARP_ENERGY_PER_STEP` | 2 | energy | D-6 |
| `SUBWARP_TIME_PER_STEP` | 1 | stardate | D-6 |
| `DOCK_TIME` | 5 | stardate | D-7 |
| `LRS_ENERGY` | 500 | energy | D-8 |
| `BLAST_RANGE` | 6 | cells | D-9 |
| `BLAST_ENERGY_BASE` | 1000 | energy per √cell | D-9 |
| `BLAST_TIME_A` | −0.37840 | stardate | D-9 |
| `BLAST_TIME_B` | 1.37840 | stardate per √cell | D-9 |
| `TORPEDO_ENERGY` | 100 | energy | D-9 |
| `TORPEDO_TIME` | 1 | stardate | D-9 |
| `EVENT_INTERVAL` | 3 | stardate | D-10 |
| `ENEMY_ADVANCE_FRACTION` | 1/3 | of enemies | D-10 |
| `ENEMY_ADVANCE_STEPS` | 2 | cells | D-10 |
| `ENEMY_FIRE_BASE` | 2000 | damage at 1 cell | D-10 |
| `ENEMY_FIRE_FALLOFF` | 1.57 | exponent | D-10 |
| `SHIP_MAX_HULL` | 2000 | hp | D-11 |
| `SHIP_MAX_SHIELDS` | 3000 | hp | D-11 |
| `SHIP_MAX_ENERGY` | 50000 | energy | D-11 |
| `SHIP_MAX_QUANTORPEDOES` | 7 | torpedoes | D-11 |
| `STARDATE_START` | 1000000..2000000 | stardate | D-12 |
| `HTTP_PORT` | 8000 | port (default of `--port`; `--host`, `--log-level` likewise) | D-13 |
| `UI_POLL_MS` | 2000 | ms | D-13 |

---

## 8. Interface

### Commands (MCP tools)
Every tool except `create_game` takes `session_id`. Mutating tools return
`{<result_key>: result, state: GameState}`. [D]

| Command | Legal when | Rule | Result key |
|---|---|---|---|
| `create_game()` | always | Session lookup | `{message, session_id, state}` |
| `galaxy_warp(y, x)` | Warp legality | Warp | `movement` |
| `subwarp(y, x)` | always | Subwarp | `movement` |
| `dock()` | Dock legality | Dock | `dock` |
| `long_range_scan()` | Scan legality | Long-range scan | *(top level, no `state`)* |
| `blast(y, x)` | Blast legality | Blast | `blast` |
| `torpedo(y, x)` | Torpedo legality | Torpedo | `torpedo` |

Result fields:
- `movement` (warp): `{new_sector_yx, distance, time, events}`
- `movement` (subwarp): `{new_ship_yx, time, path, events}`
- `dock`: `{success, message | error, time, events}`
- scan: `{scan, energy_cost, remaining_energy, events}` | `{error, required_energy, current_energy}`
- `blast` / `torpedo`: `{success, message | error, energy_cost, hit_enemy_pos, time, remaining_energy, remaining_quantorpedoes (torpedo), path (on miss), events}`

A uniform `{ok, events, …}` result for every command is proposed. [P]

### Queries

| Query | Returns |
|---|---|
| `state()` | GameState |
| `galaxy_map()` | `{map: string[10]}` — visible sectors `E\|B\|S`, hidden `.....` |
| prompt `instructions` | The decorum and rendering instructions for the LLM |
| `GET /state` | GameState of the `"default"` session |
| `GET /health` | `{status: "ok"}` |
| `GET /config` | name, version, MCP endpoint and capabilities |

**GameState:** `ship_max_hull, ship_hull, ship_max_shields, ship_shields, ship_energy,
ship_quantorpedoes, ship_yx, starbase_yx, enemies_yx, star_count, base_count, enemy_count,
map: string[10], stardate: "99-9999-99"`. [D]

### Events (messages)
Each event is a string in the `events` list of a result. Only the session's caller sees it. [D]

| Event | Messages |
|---|---|
| StarbaseHail | `Starbase communication: all clear, approach for docking` · `… under attack, needs assistance` |
| ShieldReplenish | `Shields are replenished` |
| EnemyFire | `Enemy at (y, x) fires raxxon beam! Distance: d, Damage: n` + `Ship takes n damage` · `… path is blocked` |
| EnemyAdvance | `Enemy advanced from (a) to (b)` · `… path was blocked` · `Enemy is already adjacent to ship` |

### Client contract
- **LLM:** MCP tools and the `instructions` prompt only. It holds the `session_id`. [D]
- **Browser:** polls a GameState every `UI_POLL_MS` and renders `map`, `ship_yx` and hull.
  It never changes state. [D]

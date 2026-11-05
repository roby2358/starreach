# Starreach — Criteria

How we know Starreach is correct, readable, and good. Rule names refer to ONTOLOGY.md.
Constants are referred to by name; their values are in ONTOLOGY's Numbers table.

**Instrument** is the row's status, in one of exactly four forms: `automated` (tests in
`test/R-n/` run with the normal test command), `manual — <what a human checks>`,
`not yet covered`, or `retired` (a tombstone; the ID is never reused).

**Tests.** Each `automated` R-row owns `test/R-n/` inside the package that owns the code:
`core/tests/R-n/` for rules in the Rust core, `app/test/R-n/` for the app layer. Each test asserts one rule. Tests seed
the RNG, or build an `ActiveSector` by hand, and never depend on chance. A coverage test in
the core scans both packages and fails when an `automated` row has no `test/R-n/`, a
`test/R-n/` has no `automated` row, or an Instrument cell isn't one of the four forms.

---

## R — Rules (automated)

| ID | Given | Expect | Instrument |
|---|---|---|---|
| R-1 | A newly generated galaxy | The `GALAXY_CENTER` record is `(visible, 0, 1, START_SECTOR_STARS)`. Every other record is hidden, enemies in `0..ENEMY_MAX_PER_SECTOR`, starbases in `{0,1}`, stars in `STARS_PER_SECTOR`. Over many seeds, mean enemies rise with distance from the center | not yet covered |
| R-2 | Instantiating a sector from its record and the seed | Exactly one `S`. `B` cells match the record's starbase, `E` cells match `enemies_yx` and the record's enemies, `*` cells match its stars. No cell holds two things. The same seed, sector and record give the same board | not yet covered |
| R-3 | `ray(start, dest)` on hand-built maps | `start == dest` → `[start]`. A clear line ends at `dest`. A line through an obstacle ends **at** the first obstacle (included). Leaving the board ends at the first out-of-bounds cell. The start cell is never checked | not yet covered |
| R-4 | `galaxy_warp(y, x)` | The current sector, or energy below the cost → refused, no change. With enemies present, EnemiesTurn runs first, and if the hull reaches 0 the warp doesn't happen and the game is lost. Otherwise: target marked visible; `distance = int(euclid × WARP_DISTANCE_SCALE)`; energy drops by `distance × WARP_ENERGY_PER_DISTANCE`; stardate rises by `distance × WARP_TIME_PER_DISTANCE`; new ActiveSector built; `last_event_stardate = stardate`; StarbaseHail fires iff the sector has a starbase | not yet covered |
| R-5 | `subwarp(dest)` | Ship moves along `ray` and stops before an obstacle. Steps are capped at `SUBWARP_MAX_STEPS_HOSTILE` with enemies present, else `SUBWARP_MAX_STEPS`. Zero steps, or energy below `steps × SUBWARP_ENERGY_PER_STEP` → refused, no change. Otherwise energy drops by `steps × SUBWARP_ENERGY_PER_STEP`; stardate rises by `steps × SUBWARP_TIME_PER_STEP`; map `S` moves | not yet covered |
| R-6 | `dock()` | Refused with no change when enemies are present, when there is no starbase, or when the starbase isn't within Chebyshev distance 1. On success: hull, shields, energy and torpedoes go to max, and stardate rises by `DOCK_TIME` | not yet covered |
| R-7 | `long_range_scan()` | `energy < LRS_ENERGY` → refused, no change. Otherwise energy drops by `LRS_ENERGY`; the 3×3 block around `sector_yx` becomes visible; `report.scan` shows in-bounds sectors as `"E\|B\|S"` and out-of-bounds ones as `"....."`; stardate unchanged | not yet covered |
| R-8 | `galaxy_map()` | 10 rows of 10 space-separated entries. A visible record shows `"E|B|S"` and a hidden one `"....."`. Calling it doesn't change state | not yet covered |
| R-9 | `blast(target)` | No enemy first on the ray (or the ray is blocked by a star or starbase) → refused, no change. `euclid(ship, hit enemy) > BLAST_RANGE` → refused, even when the target cell is closer. Energy below `int(BLAST_ENERGY_BASE × √r)` → refused. Otherwise the hit enemy is removed; energy drops by that cost; stardate rises by `int(BLAST_TIME_A + BLAST_TIME_B × √r)`, with `r` measured to the hit enemy | not yet covered |
| R-10 | `torpedo(target)` | No torpedoes, energy below `TORPEDO_ENERGY`, or no enemy first on the ray → refused, no change. Otherwise the first enemy is removed (any range); torpedoes −1; energy drops by `TORPEDO_ENERGY`; stardate rises by `TORPEDO_TIME` | not yet covered |
| R-11 | An action leaves `stardate − last_event_stardate = t` | Stardate events run iff `t ≥ EVENT_INTERVAL`, in the order ShieldReplenish then EnemiesTurn, and only those whose `can_occur` is true. `last_event_stardate` is set to `stardate` only when they run (or on arrival in a sector), so short actions accumulate | not yet covered |
| R-12 | EnemiesTurn with `n` enemies | Every enemy acts exactly once, in `enemies_yx` order, either advancing or firing. Over many seeded turns the advancing share is close to `ENEMY_ADVANCE_FRACTION`, and a lone enemy sometimes advances | not yet covered |
| R-13 | Enemy advance | The enemy moves to `path(enemy, ship)[min(ENEMY_ADVANCE_STEPS, len−1)]` when that cell is empty. Otherwise it stays and reports blocked. It never lands on the ship, a star, the starbase, or another enemy | not yet covered |
| R-14 | Enemy fire | A blocked ray deals no damage. Otherwise `damage = round(ENEMY_FIRE_BASE × (1/d)^ENEMY_FIRE_FALLOFF)`. Shields absorb first and the rest goes to hull; neither drops below 0. Damage strictly decreases with `d` | not yet covered |
| R-15 | ShieldReplenish fires | Shields rise by `min(SHIELD_REPLENISH, max_shields − shields, energy ÷ SHIELD_ENERGY_PER_POINT)` and energy drops by that amount × `SHIELD_ENERGY_PER_POINT`. It doesn't fire at full shields or with energy below `SHIELD_ENERGY_PER_POINT` | not yet covered |
| R-16 | Warp into a sector with a starbase | One hail message: "all clear" iff `enemies == 0`, otherwise "under attack" | not yet covered |
| R-17 | Stardate display | `int(stardate)`, zero-padded and truncated to 8 digits, shown as `99-9999-99` | not yet covered |
| R-18 | MCP tools across games | An unknown `game_id` returns `ok: false`, error "Game not found". A command on game A leaves game B unchanged | not yet covered |
| R-19 | Any sequence of commands | ONTOLOGY's invariants hold after every command (one `S`; `enemies_yx` matches `E` cells and the galaxy record; resource bounds including energy ≥ 0; stardate never decreases; visibility never reverts; status leaves `playing` at most once) | not yet covered |
| R-20 | The same seed and the same commands | The same final GameState | not yet covered |
| R-21 | The browser while an LLM plays | The page's state source returns the game the LLM is playing | not yet covered |
| R-22 | A successful blast or torpedo | The galaxy record for `sector_yx` has `enemies == len(enemies_yx)` | not yet covered |
| R-23 | Hull reaches 0; the last enemy in the galaxy is destroyed; or the ship is stranded (energy below the warp cost to the nearest other visible starbase sector) with no starbase in its sector | `status` becomes `lost`, `won`, or `lost` and an end message is in `events`. Every later action is refused with no change; queries still answer | not yet covered |
| R-24 | Warp out of a sector and back | Stars and the starbase are on the same cells. Enemies stand on the first `len(enemies_yx)` of the cells first generated for them | not yet covered |
| R-25 | Every command, accepted or refused | The Result has exactly `ok, error, events, report, state`. `error` is null iff `ok`; `report` is null iff not `ok`. A refused action returns the game unchanged. A coordinate outside `0..9` is refused | not yet covered |
| R-26 | The ship is stranded in a sector with a starbase | The game goes on; energy becomes `max(energy, STARBASE_EMERGENCY_ENERGY)` and the transfer message is in `events` | not yet covered |

## U — UI / readability

| ID | Criterion | Instrument |
|---|---|---|
| U-1 | The browser page renders the sector as a 10×10 grid with `0..9` row and column headers, using the `map` characters | manual — open the page while a game is running and compare the grid with `state().map` |
| U-2 | The browser page shows the ship's position and `hull/max_hull` | manual — check the Ship Status panel against `state()` |
| U-3 | The LLM shows the sector in the instructions format: column header, row numbers, no legend, no star count | manual — run a session in Claude Desktop and compare with `public/instructions.txt` |
| U-4 | The LLM opens a session with a greeting and the current state | manual — first reply of a fresh session |
| U-5 | The LLM keeps naval decorum ("Aye aye, captain") | manual — read a 10-turn session |
| U-6 | Long-range scan and galaxy map are shown as `E\|B\|S` grids with sector headers | manual — call both tools in a session |
| U-7 | Every event message in a result is narrated to the player | manual — check combat turns in a session: no fire or damage message goes unmentioned |

## X — Experience / outcomes

| ID | Criterion (can fail) | Linked decision |
|---|---|---|
| X-1 | Combat is dangerous. Fails if, in most of 5 engagements against ≥3 enemies, the ship takes no damage | D-10 |
| X-2 | Resources force choices. Fails if a player clears 3 enemy sectors without docking and ends above half energy and torpedoes | D-9, D-11, G-4 |
| X-3 | Exploration matters. Fails if, in most of 5 sessions, the player warps without consulting a scan or the galaxy map | D-8, D-16 |
| X-4 | A game can end. Fails if no game reaches a win or a loss | D-23 |
| X-5 | Positioning matters. Fails if, in most engagements, the player's best move ignores stars and range | D-15, D-10 |

---

## Status — 2026-11-05

- **No rule tests exist.** Every R-row is `not yet covered`. `test/unit/` holds tests of
  the Python server only (`just cc-test`). The Rust core and the TypeScript app, with
  their `test/R-n/` directories and the coverage test, are being built (D-21).
- **Python is behind the docs.** The Python server doesn't implement D-7's hull repair,
  D-9's blast geometry, D-10, or D-23 – D-29. These rows are written against the design.
- **Manual only:** U-1 – U-7. U-1 and U-2 are blocked until the page is served (Q-8), and
  R-21 with them.
- **X-1 – X-5** need play sessions on the new layers.
- **Partial coverage:** none (nothing is automated yet).

# Starreach — Criteria

How we know Starreach is correct, readable, and good. Rule names refer to ONTOLOGY.md.
Constants are referred to by name; their values are in ONTOLOGY's Numbers table.

**Instrument** is the row's status, in one of exactly four forms: `automated` (tests in
`test/R-n/` run with the normal test command), `manual — <what a human checks>`,
`not yet covered`, or `retired` (a tombstone; the ID is never reused).

**Tests.** Each `automated` R-row owns `test/R-n/`. Each test asserts one rule. Tests seed
the RNG, or build an `ActiveSector` by hand, and never depend on chance. A coverage test
fails when an `automated` row has no `test/R-n/`, or a `test/R-n/` has no `automated` row.

---

## R — Rules (automated)

| ID | Given | Expect | Instrument |
|---|---|---|---|
| R-1 | A newly generated galaxy | The `GALAXY_CENTER` record is `(visible, 0, 1, START_SECTOR_STARS)`. Every other record is hidden, enemies in `0..ENEMY_MAX_PER_SECTOR`, starbases in `{0,1}`, stars in `STARS_PER_SECTOR`. Over many seeds, mean enemies rise with distance from the center | not yet covered |
| R-2 | `ActiveSector(stars, starbases, enemies)` that fits the board | Exactly one `S`. Starbase and enemy counts match `B`/`E` cells, and `len(enemies_yx) == enemies`. No cell holds two things | not yet covered |
| R-3 | `path(start, dest)` on hand-built maps | `start == dest` → `[start]`. A clear line ends at `dest`. A line through an obstacle ends **at** the first obstacle (included). Leaving the board ends at the first out-of-bounds cell. The start cell is never checked | not yet covered |
| R-4 | `warp(y, x)` | Out of bounds or the current sector → no change, `distance 0`. Otherwise: target marked visible; `distance = int(euclid × WARP_DISTANCE_SCALE)`; energy drops by `distance × WARP_ENERGY_PER_DISTANCE`; stardate rises by `distance × WARP_TIME_PER_DISTANCE`; new ActiveSector built from the record; StarbaseHail fires iff the sector has a starbase; enemies' turn never fires | not yet covered |
| R-5 | `subwarp(dest)` | Ship moves along `path` and stops before an obstacle. Steps are capped at `SUBWARP_MAX_STEPS_HOSTILE` with enemies present, else `SUBWARP_MAX_STEPS`. Energy drops by `steps × SUBWARP_ENERGY_PER_STEP`; stardate rises by `steps × SUBWARP_TIME_PER_STEP`; map `S` moves | not yet covered |
| R-6 | `dock()` | Fails with time 0 and no refill when enemies are present, when there is no starbase, or when the starbase isn't within Chebyshev distance 1. On success: shields, energy and torpedoes go to max, **hull is unchanged**, and stardate rises by `DOCK_TIME` | not yet covered |
| R-7 | `long_range_scan()` | `energy < LRS_ENERGY` → error and no change. Otherwise energy drops by `LRS_ENERGY`; the 3×3 block around `sector_yx` becomes visible; in-bounds sectors report `"E|B|S"` and out-of-bounds ones `"....."`; stardate unchanged | not yet covered |
| R-8 | `galaxy_map()` | 10 rows of 10 space-separated entries. A visible record shows `"E|B|S"` and a hidden one `"....."`. Calling it doesn't change state | not yet covered |
| R-9 | `blast(target)` | `euclid(ship, target) > BLAST_RANGE` → fail with no change. No enemy first on the ray (or the ray is blocked by a star or starbase) → fail with no change. Otherwise the first enemy is removed; energy drops by `int(BLAST_ENERGY_BASE × √r)`, floored at 0; stardate rises by `int(BLAST_TIME_A + BLAST_TIME_B × √r)` | not yet covered |
| R-10 | `torpedo(target)` | No torpedoes → fail with no change. No enemy first on the ray → fail with no torpedo spent. Otherwise the first enemy is removed (any range); torpedoes −1; energy drops by `TORPEDO_ENERGY`, floored at 0; stardate rises by `TORPEDO_TIME` | not yet covered |
| R-11 | An action that advanced the stardate by `t` since the previous action | Stardate events run iff `t ≥ EVENT_INTERVAL`, in the order ShieldReplenish then EnemiesTurn, and only those whose `can_occur` is true. `last_action_stardate` equals `stardate` after every action | not yet covered |
| R-12 | EnemiesTurn with `n` enemies | Exactly `int(n × ENEMY_ADVANCE_FRACTION)` enemies advance and the rest fire, once each | not yet covered |
| R-13 | Enemy advance | The enemy moves to `path(enemy, ship)[min(ENEMY_ADVANCE_STEPS, len−1)]` when that cell is empty. Otherwise it stays and reports blocked. It never lands on the ship, a star, the starbase, or another enemy | not yet covered |
| R-14 | Enemy fire | A blocked ray deals no damage. Otherwise `damage = ENEMY_FIRE_BASE × (1/d)^ENEMY_FIRE_FALLOFF`. Shields absorb first and the rest goes to hull; neither drops below 0. Damage strictly decreases with `d` | not yet covered |
| R-15 | ShieldReplenish fires with `shields < max_shields` | Shields increase (amount per Q-6) | not yet covered |
| R-16 | Warp into a sector with a starbase | One hail message: "all clear" iff `enemies == 0`, otherwise "under attack" | not yet covered |
| R-17 | Stardate display | `int(stardate)`, zero-padded and truncated to 8 digits, shown as `99-9999-99` | not yet covered |
| R-18 | MCP tools across sessions | An unknown `session_id` raises "Game session not found". A command on session A leaves session B's state unchanged | not yet covered |
| R-19 | Any sequence of commands | ONTOLOGY's invariants hold after every command (one `S`; `enemies_yx` matches `E` cells and `enemies`; resource bounds; stardate never decreases; visibility never reverts) | not yet covered |
| R-20 | The same seed and the same commands | The same final GameState | not yet covered |
| R-21 | An LLM session after any command | `GET /state` (or its replacement) returns that session's state | not yet covered |
| R-22 | A successful blast or torpedo | The galaxy record for `sector_yx` has the same `enemies` count as the active sector | not yet covered |

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
| X-1 | Combat is dangerous. Fails if, in most of 5 engagements against ≥3 enemies, the ship takes no damage | D-10, Q-2 |
| X-2 | Resources force choices. Fails if a player clears 3 enemy sectors without docking and ends above half energy and torpedoes | D-9, D-11, G-4 |
| X-3 | Exploration matters. Fails if, in most of 5 sessions, the player warps without consulting a scan or the galaxy map | D-8, D-16 |
| X-4 | A game can end. Fails if no session reaches a win or a loss | Q-1 |
| X-5 | Positioning matters. Fails if, in most engagements, the player's best move ignores stars and range | D-15, D-10 |

---

## Status — 2026-11-05

- **No rule tests exist.** Every R-row is `not yet covered`. `test/unit/` holds server
  tests only (`just cc-test`). There is no `test/R-n/` directory and no coverage test yet. Deterministic tests need a seedable RNG (Q-10), although rules that
  work on a hand-built `ActiveSector` (R-3, R-5, R-6, R-9, R-10, R-13, R-14) can be tested now.
- **Expected to fail once written (known behavior gaps):** R-15 (shield replenish is a stub),
  R-20 (no seed), R-21 (the browser reads a separate session).
- **X-1 is expected to fail** because of the event-clock gap (Q-2). X-4 can't pass until there
  is a win or loss condition (Q-1).
- **Manual only:** U-1 – U-7. U-1 and U-2 are blocked until the page is actually served (Q-8).
- **Partial coverage:** none (nothing is automated yet).

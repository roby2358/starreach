# Starreach — Architecture Log

Dated entries, newest first. This is the only doc that records what changed and what it
replaced.

### 2026-11-05 — Port design settled: three layers, game_id, and twelve open questions decided
Ahead of the Rust port, the designer settled the layering and adopted Claude's
recommendation on every rule question. New decisions: D-21 (Rust `core/`, neutral TS
`app/`, `adapters/node` and `adapters/cloudflare`), D-22 (`game_id` replaces `session_id`;
the shared `"default"` session and `GET /state`/`/config` are gone from the design), D-23
(win/loss, settles Q-1), D-24 (no overdraft, Q-3), D-25 (enemy turn before warp, Q-14), D-26
(seeded sector layouts, Q-5), D-27 (shields recharge from energy, Q-6; new constants
`SHIELD_REPLENISH`, `SHIELD_ENERGY_PER_POINT`), D-28 (seeded RNG and named constants,
Q-10), D-29 (one result shape, Q-12). Revised: D-7 (dock repairs hull, Q-7), D-9 (blast
measured to the hit enemy, Q-11), D-10 (accumulating clock, Q-2; per-enemy advance roll,
Q-13; `ENEMY_ADVANCE_FRACTION` became a probability), D-15 (stop before a star, Q-4).
Q-9 dropped: the code's numbers stand and the README was corrected. Q-16 (stranded ship) was
raised and settled the same day by D-30: a stranded ship loses, unless a starbase in its sector
transfers emergency energy (new constant `STARBASE_EMERGENCY_ENERGY`; new R-26). ONTOLOGY: `last_action_stardate` became `last_event_stardate`; Game gained `seed`,
`rng`, `status`; ActiveSector counts became derived; hull and shields became integers
(damage rounded); Session/SessionRegistry became GameStore; a Core API section was added
and placement order became starbase, stars, enemies, ship. CRITERIA: R-2, R-4 – R-7,
R-9 – R-12, R-14, R-15, R-18, R-19, R-21, R-22 rewritten; R-23 – R-25 added; tests live in
`core/tests/R-n/` and `app/test/R-n/`. The Python server is now behind the docs and stays
only until the new layers play end to end.

### 2026-11-05 — D-20 revised: stay in this repo, Rust core with a thin TypeScript Worker
D-20 changed from "a TypeScript port as a `starreach/` project inside yuwakisacloud" to: keep
Starreach in this repo, write the rules as a Rust crate compiled to WASM behind one JSON
`apply` call, and keep a thin TypeScript Worker for MCP, the Durable Objects, token checking
and assets. It still deploys into the yuwakisacloud account and zone. `auth-client` is
copied in for now; publishing it is pjpd `authclient`. `YUWAKISA.md` updated to match.
Q-15 still gates the build.

### 2026-11-05 — Hosting decided: yuwakisacloud, TypeScript Worker, Durable Object per game
Added `YUWAKISA.md`, a review of yuwakisacloud's auth and server framework with a deployment
recommendation. Recorded D-20 (a `starreach/` TypeScript Worker on yuwakisacloud, one SQLite
Durable Object per game, auth/ as the identity provider) and Q-15 (whether claude.ai
connectors can sign in without dynamic client registration), which gates D-20. Nothing is
built yet. The current Python server (D-13) stays the reference until the port's tests pass.

### 2026-11-05 — Server cleanup: dead connector, CLI options, unused session fields
Deleted `src/server/mcp_connector.py` (it used the unlisted `fastmcp` package and nothing
imported it). `--host`, `--port` and `--log-level` now reach uvicorn through a
`ServerOptions` value; before this they were parsed and ignored, with the server fixed at
`0.0.0.0:8000`. Removed Session `players` and `created_at`, which nothing read (D-18 still
sets multiplayer aside). Pinned `mcp < 2`, because mcp 2.x renamed FastMCP and breaks the
server import. Added the pytest setup (`pytest.ini`, `requirements-dev.txt`, `test/unit/`)
and `just` recipes. No design IDs changed.

### 2026-11-04 — Ontology doc set created from the code and README
Added `docs/ONTOLOGY.md`, `CRITERIA.md`, `RATIONALE.md`, `DYNAMICS.md`, this log, and
`tools/model_balance.py` (the harness behind the modeled Evidence). The README's game-mechanics
paragraph and "Rev 1" note are replaced by a pointer to these docs. The code was treated as
the truth. Where the README or the code's own comments disagreed with it:

- README: stars per sector "0–7". Code: `STARS_PER_SECTOR` 2–8. → Q-9
- README: start at "[4,4:5,5]". Code: `GALAXY_CENTER` (4,4). → Q-9
- README: navigating into a star ends the game. Code: the ship stops before the star. → Q-4
- README: MCP server on port 8001 and UI at `/static/index.html`. Code: one server on
  `HTTP_PORT` (or stdio), and no static route. → Q-8, Q-9
- README: the browser "provides a view into the state of the game". Code: `/state` shows a
  separate `"default"` session. → Q-8
- `index.html` links `styles.css` and `script.js` at the root. The files are in `css/` and `js/`. → Q-8
- `Game.long_range_scan` docstring: energy cost 100. Code: `LRS_ENERGY` 500. (The docstring is stale.)
- `ActiveSector.blast` comment: time 3 at range 6. Code gives 2. → Q-11
- The 0acd0bd commit message ("it still doesn't work") matches the event-clock gap. → Q-2
- `ShieldReplenish` is a stub with no effect. → Q-6
- `src/server/mcp_connector.py` imports `fastmcp` (not in requirements) and is never used.
  The `--host`, `--port` and `--log-level` arguments are parsed but ignored. (Tickets, not design.)

Earlier history, reconstructed from `git log`:

### 2025-07-02 — Galaxy generation reworked
Enemy count scales with distance from `GALAXY_CENTER`. Event helpers became static methods.

### 2025-06-23/24 — Enemies move and fire; stardate events
EnemiesTurn added EnemyFire and EnemyAdvance. The stardate event clock was introduced and
reworked; the author noted it didn't yet work as intended.

### 2025-06-22 — Stardate, warp events, energy limits
Stardate added. Warp events (StarbaseHail) and stardate events (ShieldReplenish,
EnemiesTurn) added. Movement range limits and energy costs added for blasts and torpedoes.

### 2025-06-18/20 — Galaxy, warp, scan, dock, weapons
Galaxy map and long-range scan; warp between sectors; energy costs for movement and scans;
docking; blaston beams; quantorpedoes.

### 2025-06-15/17 — Game core and sessions
Game, GameState and the state tool; the active sector; subwarp; (y, x) coordinates;
instructions became an MCP prompt; session support. Multiplayer set aside (D-18).

### 2025-05-22 – 2025-06-14 — MCP server
FastMCP server working with the MCP Inspector; stdio mode for Claude Desktop.

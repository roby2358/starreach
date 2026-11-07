# Starreach — Architecture Log

Dated entries, newest first. This is the only doc that records what changed and what it
replaced.

### 2026-11-07 — The page becomes one Holotank display; the tabs are gone
The designer chose Holotank from five mockups (`docs/mockups/viewer_styles.html`) and dropped the
tabs, because the player otherwise never needs the mouse. U-10 now states the one display, and new
U-11 covers the warp and enemy-gone animations. The enemy-gone flare covers the whole plane: enemies
move, so a frame can't say which one died until there are events. The page serves Oxanium itself
(OFL, `public/fonts/`), so `PAGE_FILES` entries are now bytes.

### 2026-11-07 — The page shows the current sector, under Quadrant and Galaxy tabs
The designer asked for the page to feature the current sector, with tabs above the map. GameView
gains `board`, the ship's sector as map rows, so a running server must restart to serve the new
page's frames. New U-10; U-9 is now automated.

### 2026-11-07 — A second stdio client forwards to the first; default port 8572
The Claude desktop app launches one stdio server for chat and another for Cowork and Code
sessions with the same arguments, so whichever came second crashed on `EADDRINUSE`. That process
now forwards its MCP messages to the server holding the port (`adapters/node/src/bridge.ts`), and
still refuses a port held by anything else. `HTTP_PORT` moved from 8000 to 8572.

### 2026-11-07 — Viewer decisions: survey panel kept, sector board decided, link to be hashed
The designer kept the survey panel (new U-8), decided the page will show the current sector's
board (settles Q-18 under D-31; new U-9, not yet covered), set the direction for Q-17 (a hash of
the `game_id` in the link) and deferred Q-19 to multiplayer design. The GameView invariant no
longer rules out a sector board. Added `tools/container_tools.py` and `just cc-setup`,
because rebuilding the dev container removes the C linker and Chromium's libraries.

### 2026-11-07 — Dual display: a read-only browser viewer over a WebSocket
The designer set the shape: MCP for the LLM as ship's computer, plus an HTTP page and WebSocket
that show the game read-only, starting with the galaxy map and ship status (D-31). This
replaces the polling design, settles Q-8 and raises Q-17 – Q-19. New: the core's `view`
(GameView), the app layer's `Viewers` and frames, `adapters/node/src/server.ts` and
`viewers.ts`, a rewritten `public/` page with jQuery gone, and `view_url` in `new_game`'s
report. `UI_POLL_MS` is gone; `RECONNECT_MIN_MS`, `RECONNECT_MAX_MS`, `VIEWER_MAX_FRAME_BYTES`
and `LOW_GAUGE_FRACTION` are new. The Node adapter now serves HTTP in both modes and
requires `--host`, `--port` and `--origin`, so an existing Claude Desktop config has to add
them. A stdio process now exits when stdin closes, since the listener would otherwise keep
it alive holding the port. CRITERIA: R-21 and U-1 – U-2 rewritten and automated, R-27 and
R-28 added. `playwright-core` drives the page test and `ws` holds the Node sockets. The Cloudflare
adapter's socket side is still to come.

### 2026-11-05 — Python server retired; balance harness ported to Rust
A full game in Claude Desktop, played through the Node adapter over stdio, passed the
play-test D-21 set as the gate. Deleted the Python server and its setup: `src/`,
`starreach.py`, the requirements files, `pytest.ini`, `test/unit/`, the `Vagrantfile`, and
the `cc-test` recipe. `tools/model_balance.py` became `core/examples/model_balance.rs`, which
draws galaxies from seeds through the real generation and calls the core's own `fire_damage`,
`blast_energy` and `blast_time`. The last two were split out of `blast` for this. The
`cc-model-balance` recipe runs it and now requires the galaxy count. RATIONALE D-3, D-4, D-9
and D-10 now cite it. The combat numbers are identical. The generation means match the Python's
(mean 198 enemies against 199, about 3 starbases, 13% Star Central only, 40 enemy-free
sectors); the enemy range is 123–281 against 140–265, from different samples.
`public/instructions.txt` now tells the crew to start with `new_game` and pass `game_id`.
CRITERIA Status no longer says the Python is behind the docs.

### 2026-11-05 — App layer and Node adapter built; the core runs as WASM
Added `app/` (`@starreach/app`), which works on any platform:
- `loadCore` wraps the wasm-bindgen output (`--target web`, so each platform hands in its
  own `WebAssembly.Module`).
- The GameStore interface comes with a `MemoryStore`.
- Game lookup stores a game only when a command is accepted.
- The MCP tools come from one table of commands, plus `new_game` and the `instructions`
  prompt.
- `handleHttp` serves `/mcp` and `/health` as a single fetch handler. MCP over HTTP is
  stateless, using the SDK's web-standard transport ([P]).

Added `adapters/node/`, which serves `stdio` or `http --host --port` through
`@hono/node-server` and logs to stderr, so stdout carries only MCP. The TypeScript runs
under Node 26's type stripping, with no build step. `tsc` typechecks only. New just recipes:
`setup`, `serve`, `stdio`, `cc-build-wasm`, `cc-test-app`, `cc-typecheck`, `cc-test-all`. The
generated `app/src/wasm/` is gitignored.

Docs:
- ONTOLOGY: GameStore, Game lookup, the MCP tools, HTTP and the app contract are [D]. The
  Cloudflare adapter stays [D, unbuilt]. Two additions: other paths return 404, and tool
  arguments that don't fit the schema come back as MCP tool errors without reaching the
  game ([P]).
- CRITERIA: R-18 is `automated` in `app/test/R-18/`. `app/test/R-25/` covers the not-found
  result, which closes R-25's partial coverage.
- RATIONALE: D-22 is built.
- README: the launch steps now describe the new layers.

### 2026-11-05 — Rust core built: every rule, seeded, with tests per R-row
Added `core/`, a Rust crate with `new_game(seed)` and `apply(game, command)`, plus JSON
versions of both for the WASM boundary. It implements every rule in ONTOLOGY, including
D-7 hull repair, D-9 blast geometry, D-10, and D-23 – D-30. The rules, invariants and Core
API are now tagged [D]. Still [D, unbuilt]: the WASM build, the app layer (GameStore, game
lookup, MCP tools), the HTTP adapters and the browser. The RNG is SplitMix64, and its state
travels as a string. Sector placement now draws among the empty cells, which always
succeeds, instead of trying up to `PLACEMENT_ATTEMPTS` random cells. The constant is
removed, and the [P] tag marks the change. CRITERIA: R-1 – R-17, R-19, R-20 and R-22 – R-26
are `automated` in `core/tests/R-n/`, with the coverage test in `core/tests/coverage.rs`
(`just cc-test-core`). R-9 is reworded: the hit enemy is never farther than the target cell,
so the old "target cell is closer" case couldn't happen. R-25 is reworded: `report` is null
when refused (the `state` query has a null report too). DYNAMICS anti-strategies are now
"Prevented". pjpd closed the eleven rule tickets.

### 2026-11-05 — ONTOLOGY and the Python code reconciled: tags corrected
I checked each [D] claim in ONTOLOGY against the Python code. Some were decided but not
built, and are now tagged [D, unbuilt]: integer hull and shields, rounded enemy damage,
counts derived from the board, seeded sector layouts, hull repair at a starbase, the
per-enemy fire-or-advance roll, and the ShieldReplenish, game-end and emergency-energy
messages. The Game end rule runs after accepted actions only. The EnemyAdvance blocked
message now quotes the code. Code fixes, with no change in behavior: stale docstrings
(dock time, blast time at range 6, the long-range scan's off-galaxy entries), and dead
branches removed (EnemyAdvance "already adjacent", EnemyFire at distance 0). D-13 no longer
says the README describes port 8001. No IDs changed.

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

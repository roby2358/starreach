# Starreach — Architecture Log

Dated entries, newest first. This is the only doc that records what changed and what it
replaced.

### 2026-11-15 — Players connect with only the MCP URL
Every MCP client shared Starreach's pre-registered client id: players pasted it into claude.ai's
"Use your own OAuth client", and Claude Code needed `--client-id` and `--callback-port 8574`.
auth/ now accepts a client's own Client ID Metadata Document for Starreach's resource and
confirms the client with the player once, so the home page and README give only the URL. Nothing
in Starreach's code changed: it already accepted its resource URL as the audience. The
pre-registered client stays for clients without a metadata document and for `just cc-dev-token`.
D-41 updated.

### 2026-11-15 — A token's audience may be the MCP resource URL
Starreach accepted only its pre-registered client id as a token's `aud`. auth/ now binds a token
to the `resource` the MCP client names, so Starreach accepts either its canonical MCP URL (the
new `STARREACH_RESOURCE` var, also what the protected resource metadata now gives as `resource`,
formerly built from the request's origin) or the client id, for good. The vendored auth-client
checks one audience, so the Worker verifies against the URL and, on a wrong audience, against the
client id. `just cc-dev-token` names the resource by default. D-41 and R-35 updated.

### 2026-11-15 — Q-15 settled: claude.ai signs in to auth/ with a pre-registered client
The designer connected claude.ai to production `/mcp` with "Use your own OAuth client" and the
production client id, signed in with Bluesky through auth/, and played. Q-15 (can claude.ai sign
in to auth/ without dynamic client registration) is settled by D-41, and D-20 is no longer gated.

### 2026-11-15 — MCP needs sign-in through auth/
The auth seam allowed every request to `/mcp` and to viewer sockets. Now, on Cloudflare, `/mcp`
serves only a player signed in with auth/: 401 with RFC 9728 protected resource metadata naming
auth/, offline verification with auth-client (vendored from yuwakisacloud at its source commit,
adding the `cbor-x` dependency pinned exactly and installed without scripts), the `starreach:play`
scope, and a `whoami` tool. Viewer sockets carry no sign-in (their links hold a hash and are
read-only), and the Node adapter stays open. The Worker gains the `AUTH_SERVICE` binding and
`AUTH_ISSUER` and `STARREACH_CLIENT_ID` vars, with a different client id locally and in
production. In yuwakisacloud, auth/ serves its discovery at the RFC 8414 path too, and its local
seed has the local starreach client. New D-41 and R-35; Q-15 narrowed to trying real clients. The
home page's connection steps give the client id. `just cc-dev-token` mints a local token, and the
smoke test checks sign-in and plays only with `SMOKE_TOKEN` where sign-in is required.

### 2026-11-15 — Home page at `/`, viewer moved to `/viewer`
`public/index.html` was the viewer, served at `/` and linked as `/?view=<view_id>`. It is now a
home page for new players (D-40, U-12), and the viewer is `public/viewer.html`, linked as
`/viewer?view=<view_id>`. Links from earlier games (`/?view=`) stop working; the designer accepted
that. The Node adapter serves the new pages and `css/home.css`; the smoke test checks
`/` and `/viewer`. ONTOLOGY's `viewer_url` and HTTP routes updated.

### 2026-11-15 — Raxxon damage follows the blast profile
Enemy fire was `ENEMY_FIRE_BASE × (1/d)^ENEMY_FIRE_FALLOFF` (exponent 1.57: 674 at 2, 356 at 3,
120 at 6). The designer gave it the blast kill chance's shape: `ENEMY_FIRE_BASE` (2000) at 1 cell,
linear to `ENEMY_FIRE_NEAR` (1800) at `ENEMY_FIRE_NEAR_RANGE` (2), exponential to `ENEMY_FIRE_FAR`
(100) at `ENEMY_FIRE_FAR_RANGE` (9), flat beyond. `ENEMY_FIRE_FALLOFF` is removed. The decay is a
shared `geometry::exp_falloff`, which `blast_kill_chance` now uses too. New D-39; D-10, D-36, D-37
and R-14 updated. Mid-range fire is much heavier: about 3.3× at range 3 (1191 against 356).

### 2026-11-15 — Starbases are placed after generation, spread apart
Every sector except Star Central used to roll `STARBASE_CHANCE` (0.02) for a starbase, so a
galaxy could have none beyond home, or several bunched together. Generation now draws a count in
`STARBASE_EXTRA_MIN..=STARBASE_EXTRA_MAX` and places each at least `STARBASE_MIN_SPACING` from
every earlier one, trying `STARBASE_PLACE_TRIES` random sectors per starbase and stopping short
if none fits. `STARBASE_CHANCE` is removed. New decision D-38, row R-34; D-4 now points to it.
The balance harness prints the starbase range. Every seeded galaxy changes; saved games keep
their stored galaxy and are unaffected.

### 2026-11-15 — Blasts are sure out to range 4
`BLAST_SURE_RANGE` goes from 3 to 4, so a blast kills with `BLAST_KILL_CHANCE_NEAR` one cell
farther than raxxon fire's effective range, giving the player the edge in a busy sector. The
exponential falloff to `BLAST_RANGE` is unchanged in form and now runs 0.58 at 5, 0.37 at 6,
0.1 at 9. D-36 updated; the `blast` description and `instructions.txt` give the new range.

### 2026-11-15 — The blast kill chance decays exponentially
The kill chance between `BLAST_SURE_RANGE` and `BLAST_RANGE` fell linearly (0.77 at 4, 0.5 at 6).
The designer replaced it with exponential decay between the same end points, `NEAR × (FAR /
NEAR) ^ fraction of the way`: about 0.62 at 4, 0.43 at 5, 0.3 at 6, 0.1 at 9. No new constants.
D-36 is now fully Decided; R-32 checks the geometric mean at the middle and a constant ratio per cell.

### 2026-11-15 — Blasts can miss; enemy fire varies
Blasts always destroyed the enemy they hit within range 6, and enemy fire dealt a fixed amount
per range. The designer kept blasts all-or-nothing, with no enemy hull: a blast now kills with
`BLAST_KILL_CHANCE_NEAR` (0.9) up to `BLAST_SURE_RANGE` (3), falling to
`BLAST_KILL_CHANCE_FAR` (0.1) at `BLAST_RANGE`, which goes from 6 to 9. A miss pays energy and
time, leaves the enemy, adds a "Blaston beam misses" event, and shot reports gain `destroyed`.
`enemy_fire` scales damage by a factor drawn in `ENEMY_FIRE_VARIANCE_MIN..MAX` (0.75..1.25), which
ambush shares. Both draw from the game's rng. New decisions D-36 and D-37, rows R-32 and R-33;
D-9, D-19, R-9, R-14 and R-22 updated. The balance harness prints the band and the kill chance;
the `blast` description and `instructions.txt` give the new reach.

### 2026-11-15 — Arriving in a hostile sector can draw fire
Arrival was free: nothing in a newly entered sector acted until the player's next timed action. After
instantiating the target, the Warp rule now calls `ambush`: each enemy fires once with probability
`ENEMY_AMBUSH_CHANCE` (0.3), through `enemy_fire` and the game's rng, stopping when the hull is 0
(then the game is lost). New decision D-35 and row R-31; the `galaxy_warp` description says so.

### 2026-11-15 — Enemies sometimes approach obliquely
Advancing enemies always stepped down the same Bresenham ray that blasts and torpedoes use, so they
often walked into a shot already aimed at them. `enemy_advance` now draws an approach from the
game's rng: oblique left and right each `ENEMY_OBLIQUE_CHANCE / 2` (0.25), else head-on. Oblique
steps turn the head-on step one octant, never get farther from the ship, and stay put when blocked.
New decision D-34 and row R-30; R-13 now covers the head-on path (`advance_by`).

### 2026-11-15 — Enemy range, bearing and clear shot in GameState
The LLM worked out distances and lines of fire by hand before choosing blast or torpedo.
`GameState.enemies` (replacing `enemies_yx`) now lists each enemy as `{yx, range, bearing,
clear_shot}`, computed in the core: `range` is the blast distance to two decimals, `bearing` is
whole degrees clockwise from up, and `clear_shot` asks the same `first_enemy` ray that blast
and torpedo use. `public/instructions.txt` has the LLM show a short enemy table under the sector
map. New decision D-33 and row R-29. The viewer page is unchanged.

### 2026-11-15 — The long-range scan takes a round of time
`long_range_scan` spent `LRS_ENERGY` but no time, so enemies never acted and a scan in the
middle of a fight was free. It now advances the stardate by the new `LRS_TIME` (3, equal to
`EVENT_INTERVAL`, so a scan always completes a round) and runs `stardate_events`, the same path
subwarp, dock and the weapons use; `report.time` is added. In a cleared sector the stardate
advances and nothing else happens. D-8 and R-7 updated; the tool description says it takes a turn.

### 2026-11-14 — Server instructions; wait for orders; the subwarp cap; viewer_url
In the first live game the LLM played several sectors before the player had opened the viewer, and
was surprised when a subwarp stopped after 3 cells. `instructions.txt`, until now only an MCP
prompt that clients rarely load, is also sent as the server's instructions in `initialize`, so
the LLM always has it. It now casts the LLM as the ship's computer working with the captain to
make the galaxy safe, and says to give the captain the viewer link and wait for orders.
`subwarp`'s description states the `SUBWARP_MAX_STEPS_HOSTILE` cap while enemies are present
(the rule itself, D-6, is unchanged). `new_game`'s `report.view_url` is renamed `viewer_url`,
matching the Viewer it opens; `view_id` keeps its name, as the key every viewer of a game shares.

### 2026-11-14 — Both adapters limit viewer frames to 128 bytes
The designer set `VIEWER_MAX_FRAME_BYTES` to 128 (from 1024), enough for a ping or a small view
setting, and made it apply on Cloudflare too: the Durable Object's message handler, empty before,
now closes a socket with 1009 on a larger frame. The constant moved from the Node server into the
app layer (with `FRAME_TOO_BIG_CLOSE`), so both adapters read one value. ONTOLOGY's Viewer socket
rule and D-31 drop the Node-only [P]; R-27 now covers the limit in both adapters.

### 2026-11-14 — First deploy to starreach.yuwakisa.com
The Cloudflare adapter is deployed to production with `just cf-deploy` (`wrangler deploy --env
production`), on the account and zone shared with yuwakisacloud; the `custom_domain` route
created the DNS record and certificate. Auth is deferred by the designer: the seam still allows
all, so anyone with the URL can start games until sign-in lands (D-20, Q-15). Smoke test on the
live site: `/health` 200, `new_game` over `/mcp`, the viewer page loads, `instructions.txt` is not
served, and a viewer socket got its frame on connect and a second after a `long_range_scan`.
Recipes `cf-whoami` and `cf-deploy` added. D-21 now records the deploy.

### 2026-11-14 — The Cloudflare adapter serves viewers and the page
The Durable Object that stores a game now also holds its `/live/<view_id>` sockets, with the
hibernation API (D-31). The Worker calls the auth seam before the upgrade and routes it to the
object by `view_id`; the object sends the current frame, or closes with 4404 when it has no
game. `publish` was a no-op and is now a call on the object that sends the frame to its sockets.
`public/` is served as static assets, except `instructions.txt` (`public/.assetsignore`), so
`view_url` opens a working page under `just cf-dev`. The adapter ignores viewer frames of any
size, so `VIEWER_MAX_FRAME_BYTES` is the Node adapter's alone, and R-27's row says so. R-21 and
R-27 gain tests under `adapters/cloudflare/test/`, whose files now share one worker and its
storage. D-21's Cloudflare adapter was "partly built" and is now built. Nothing is deployed.

### 2026-11-14 — The Cloudflare adapter serves MCP and stores games; viewers come later
`adapters/cloudflare/` now exists (D-21): a Worker serves the app layer's `/mcp` and `/health`
with the WASM core bundled in, and each game lives in a SQLite-backed Durable Object named by
its `view_id`. Its `publish` does nothing and it serves no page or socket, so `view_url` leads
nowhere there yet. An auth seam is called before `/mcp` and allows everything (Q-15). The
adapter's tests run inside workerd under vitest (`just cc-test-cloudflare`), and `just cf-dev`
runs it under `wrangler dev`. The designer confirmed the hostname `starreach.yuwakisa.com`, which
is the route of `wrangler.jsonc`'s production environment. Nothing is deployed.

### 2026-11-14 — Q-17 is settled by D-32: the viewer's link holds a hash of the game_id
The link and socket used to carry the `game_id`, so sharing the link shared the controls. They now
carry `view_id`, the hex SHA-256 of the `game_id`: the link is `/?view=<view_id>` (was `?game=`), the
socket is `/live/<view_id>`, and the GameStore and Viewers are keyed by `view_id`. MCP hashes the
`game_id` it receives. Games stored under the old keys can't be found; local games were in memory
and are forgotten on restart anyway, so there is no migration. D-31's link is no longer Proposed.

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

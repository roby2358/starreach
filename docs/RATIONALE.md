# Starreach — Rationale

Why each current choice was made, what else was considered, and what is still open.
Constants are referred to by name (values are in ONTOLOGY's Numbers table). Decisions
marked *Decided* are shipped behavior the designer built. *Proposed* entries are Claude's
inferences, waiting for review.

---

## Interface and architecture

### D-14 The LLM is the player's interface — *Decided*
- **Alternatives:** a conventional browser UI with buttons; a text-command parser.
- **Why:** G-1. Natural-language orders to a crew are the experience (F-command). The
  `instructions` prompt sets decorum and the rendering formats so the narration stays
  consistent.
- **Evidence:** none recorded (U-3 – U-5 are manual).

### D-13 One process serving MCP and HTTP; sessions in memory — *Decided*
- **Alternatives:** separate MCP and HTTP servers on different ports; a database-backed
  session store.
- **Why:** The simplest thing that runs under Claude Desktop and the MCP Inspector, and the
  viewer can only see the LLM's game if one process holds both. Persistence is a non-goal.
- **Evidence:** none recorded.

### D-20 Deploy into yuwakisacloud from this repo: Rust core in WASM, thin TypeScript Worker, one Durable Object per game — *Decided, unbuilt; gated on Q-15*
- **Choice:** Starreach stays in this repo and deploys into the yuwakisacloud Cloudflare
  account and zone at `starreach.yuwakisa.com`. A Rust `starreach-core` crate holds the
  rules. It is deterministic with a seeded RNG (D-28) and is compiled to WASM behind one
  JSON function, `apply(state, command) -> result`, with one result shape (D-29). A thin
  TypeScript Worker owns everything that touches the platform: streamable-HTTP MCP at
  `/mcp`, one SQLite Durable Object per game storing the state and the owner's auth/ `sub`,
  token checking with `auth-client` (copied into this repo for now), the auth service
  binding, and `public/` as static assets. That layer is the Cloudflare adapter of D-21.
  The details are in `YUWAKISA.md`.
- **Alternatives:** a TypeScript rewrite as a `starreach/` project inside yuwakisacloud (the
  platform's single-language posture); a full Rust Worker with `workers-rs` (it would have to
  re-implement the token check); Python in Cloudflare Containers; Python Workers with Durable
  Objects; a Cloudflare Tunnel to a home machine.
- **Why:** The platform supplies identity, the domain and the deploy pattern, and the
  connection is only account configuration and HTTP, so the repo can stay separate (history,
  docs, IDs and pjpd stay together). The platform's TypeScript-only, no-FFI posture governs
  yuwakisacloud's code. Starreach respects it where it touches the platform by keeping that
  layer TypeScript and using `auth-client`. Rust gives the rules strong types, enum dispatch
  for commands and events, fast deterministic `cargo test`, and room to grow toward
  multiplayer and balance simulations. A single JSON call keeps the FFI cost small. A
  Durable Object per game makes games persist, keeps actions in order, and is the shape
  multiplayer needs (D-18). The owner check and a signed-in browser view replace the shared
  `"default"` session (Q-8, G-3).
- **Evidence:** Review of yuwakisacloud in `YUWAKISA.md`, with file citations. Nothing has
  been measured yet.

### D-21 Three layers: Rust core, platform-neutral TypeScript app, one adapter per platform — *Decided; core, app and Node adapter built, Cloudflare adapter unbuilt*
- **Choice:** `core/` is the Rust crate (rules only, compiled to WASM). `app/` is a
  TypeScript package with no platform imports: it defines the MCP tools and the
  `instructions` prompt, loads the core, and talks to storage through a `GameStore`
  interface. `adapters/node/` runs the app over stdio and streamable HTTP with an in-memory
  store. `adapters/cloudflare/` is the only place Cloudflare APIs appear: the Worker, the
  Durable Object store, `wrangler.jsonc`, and the auth hook. npm workspaces join the TS
  packages. `just` recipes launch either adapter locally on `HTTP_PORT`.
- **Alternatives:** a single Worker project (Cloudflare APIs spread through the code); an
  app with only the Cloudflare adapter, run locally under `wrangler dev` (no stdio for
  Claude Desktop).
- **Why:** The rules can't depend on a platform, and the MCP surface shouldn't either.
  Keeping Cloudflare in one directory means a platform change touches one adapter. The Node
  adapter keeps Claude Desktop (stdio) working without Cloudflare tooling.
- **Evidence:** none yet.

### D-22 Games are addressed by an explicit `game_id` — *Decided*
- **Alternatives:** bind the game to the MCP connection (a reconnect loses the game unless
  auth ties it to a user).
- **Why:** G-1: the LLM holds the id and can resume. It maps directly onto one Durable
  Object per game, and it works before auth exists. Once auth exists, the store also
  records the owner's `sub` (D-20).

### D-31 Dual display: the LLM plays over MCP, a read-only browser page follows over a WebSocket — *Decided; the routes, frame shape and link are Proposed*
- **Choice:** MCP stays the only way to act, with the LLM as the ship's computer. A browser
  page gets the current sector's board, the galaxy map, ship status and a survey panel for one
  game, pushed over a per-game socket. Everything shows on one display, with the board as a
  tilted hologram in the middle, because the player otherwise doesn't need the mouse at all. The
  core makes the view (`view`, which can't change a game and shows only what's uncovered),
  the app layer makes frames and publishes after each accepted command, and each adapter holds
  the sockets. `new_game` reports the link, and the crew hands it to the captain.
- **Alternatives:** polling a `/state` route (delay, and load that grows with viewers);
  building the view in TypeScript from the Game (the app layer would have to read Game
  fields, and the hidden-sector rule would live outside the core); showing the most recent
  game with no id (works for one local player, but not on a shared server or in multiplayer);
  a separate port for the view (a Worker has one origin).
- **Why:** G-3. The split fits Cloudflare: a per-game socket list maps onto one Durable Object
  per game, which can hold hibernating sockets. Several viewers per game already work, which
  multiplayer will need (D-18). Typed frames leave room for events on the same socket.
- **Evidence:** `just cc-test-page` drives the page in Chromium against the real server.
  Not yet watched alongside a real LLM session.

### D-28 All randomness comes from a seed stored in the game; constants are named — *Decided*
- **Alternatives:** a global, unseeded RNG; tests that build boards by hand only.
- **Why:** The core is a pure function of `(game, command)`, so every random draw has to
  come from state carried in the game. This makes R-20 (determinism) testable and lets
  sector layouts persist (D-26). Constants live in one Rust module under the names in
  ONTOLOGY's Numbers table.

### D-29 Every command returns one result shape — *Decided*
- **Alternatives:** per-command shapes (`distance: 0`, `success: false`, a bare `error`, a
  scan failure without `state`).
- **Why:** The LLM and the app layer handle one shape: `{ok, error, events, report,
  state}`. Every field is always present, so a client never tests whether a key exists.

### D-17 Events are strings — *Decided*
- **Alternatives:** structured event records (`{type, from, to, damage}`) that the LLM or
  browser could render.
- **Why:** The LLM narrates text well, and strings were the quickest route to G-1.
  Structured events would let the browser animate them (G-3) and let tests assert on
  fields instead of text.
- **Evidence:** none recorded.

### D-18 Multiplayer is set aside — *Decided*
- **Alternatives:** shared sessions where several players join one game.
- **Why:** Focus on making the single-player loop work first. A session holds only its id
  and its game.

---

## World

### D-1 A 10×10 galaxy of 10×10 sectors, addressed (y, x) — *Decided*
- **Alternatives:** (x, y) coordinates; other grid sizes.
- **Why:** (y, x) matches how the LLM prints grids, row first. The instructions tell the
  LLM so explicitly. A 10×10 grid fits single-digit headers, so it stays readable as text.

### D-2 Start at Star Central, `GALAXY_CENTER`, with a starbase and no enemies — *Decided*
- **Alternatives:** a random start sector; a hostile start.
- **Why:** A safe home base gives the map an anchor and the player a place to return to
  (DYNAMICS: home base). (4,4) is off-center in a 10×10 grid. Enemy scaling normalizes by
  `ENEMY_DISTANCE_NORM` as if the center were (5,5).
- **Evidence:** none recorded.

### D-3 Enemy density rises with distance from the center; every sector has 2–8 stars — *Decided, tuned by none yet*
- **Alternatives:** uniform density; hand-placed enemies.
- **Why:** Danger grows the farther you venture from home (escalating commitment). Stars
  give every board some cover.
- **Evidence:** Modeled by: `just cc-model-balance 2000` (unverified
  in play): about 198 enemies per galaxy (range 123–281), about 40 of 100 sectors have no
  enemies. The negative part of `ENEMY_BASE_ROLL` is what produces those empty sectors.

### D-4 Starbases are rare — *Decided, tuned by none yet*
- **Alternatives:** a fixed number of starbases; one per galaxy region.
- **Why:** Resupply should be a destination (G-4).
- **Evidence:** Modeled by: `just cc-model-balance 2000` (unverified in play): about 3 starbases
  per galaxy including Star Central. In about 13% of galaxies Star Central is the only one.

### D-16 Fog of war over the galaxy — *Decided*
- **Alternatives:** a fully revealed galaxy.
- **Why:** F-discovery. Information costs something: a long-range scan costs `LRS_ENERGY`,
  and a warp costs a trip.

### D-15 One ray rule for all movement and fire — *Decided*
- **Alternatives:** pathfinding for movement; hit-scan weapons that ignore obstacles.
- **Why:** One code path. Stars and other ships become cover for both sides, which makes
  positioning matter (F-danger). Blocked fire is visible in the messages. A move toward a
  star stops in the cell before it, rather than destroying the ship: instant death from one
  misread coordinate is harsh with an LLM in the loop.

### D-19 Enemies are anonymous and die in one hit — *Decided*
- **Alternatives:** enemy health; named enemy races (the names Rasphyx, Geakthon,
  Deltaclast, Auvoros and Raskaos appear in a code comment).
- **Why:** Simple. Each kill is clearly reported by position.

---

## Actions

### D-5 Warp cost and time grow linearly with distance; time is tiny — *Decided*
- **Alternatives:** a flat warp cost; time that grows with distance at the same scale as
  combat actions.
- **Why:** Long jumps cost more energy. Warp time (`WARP_TIME_PER_DISTANCE`) is very small
  next to `EVENT_INTERVAL`, so warping never triggers stardate events.

### D-6 Subwarp is shortened while enemies are present — *Decided*
- **Alternatives:** a fixed movement range; movement costed by energy alone.
- **Why:** In combat you can't simply fly away from enemies within a sector, so each move
  is a tactical step (F-danger).

### D-7 Docking fully resupplies and repairs, but needs a clear sector and an adjacent starbase — *Decided*
- **Alternatives:** partial resupply over time; docking under fire; no hull repair.
- **Why:** The starbase sector must be cleared first. Docking is the reward. It restores
  the hull too, because otherwise hull damage is a countdown with no counterplay, and
  "retreat to resupply" (DYNAMICS) needs a resupply that matters.

### D-8 A long-range scan costs energy and reveals the 3×3 block — *Decided*
- **Alternatives:** free scans; scans that cost time.
- **Why:** Information as currency (F-discovery). `LRS_ENERGY` is small next to
  `SHIP_MAX_ENERGY`, so the price is mild.

### D-9 Two weapons: blast (ranged, energy) and torpedo (unlimited range, limited ammo) — *Decided*
- **Alternatives:** a single weapon.
- **Why:** A real choice between them. The blast is limited by `BLAST_RANGE` and its cost
  rises with √range, measured to the enemy it hits, not to the aimed cell (so aiming past
  a near enemy costs what hitting it costs). The torpedo is cheap in energy but scarce (`SHIP_MAX_QUANTORPEDOES`)
  and reaches anything on the ray.
- **Evidence:** Modeled by: `just cc-model-balance 2000` — a blast costs 1000 energy at range 1, 1414 at
  range 2, and 2449 at range 6. That is roughly 20–50 blasts per full tank. Blast time is
  1 up to range 2 and 2 from range 3 to 6.

### D-10 Enemies act on an accumulating stardate clock; each enemy advances with probability `ENEMY_ADVANCE_FRACTION`, else fires — *Decided, tuned by none yet*
- **Alternatives:** a clock that resets after every action (then no single action but a
  3-step subwarp ever fills it, so shots never draw a reply); enemies act after every
  action; lowering `EVENT_INTERVAL`; a fixed split of `int(n × ENEMY_ADVANCE_FRACTION)`
  advancers (0 for 1–2 enemies, so small groups never close in).
- **Why:** Time passing is the threat, and it adds up across actions, so every action that
  takes time brings the next enemy turn closer. Faster actions still buy more shots before
  the reply. A per-enemy roll lets small groups advance too. Damage falls off steeply with
  distance, so range is protection.
- **Evidence:** Modeled by: `just cc-model-balance 2000` — 2000 damage at range 1, 674 at 2, 356 at 3, 120
  at 6. With 5000 shields plus hull, about 2.5 point-blank hits destroy the ship.

### D-23 A game ends: hull 0 loses, destroying every enemy in the galaxy wins — *Decided*
- **Alternatives:** a stardate deadline; open-ended play.
- **Why:** G-2 and F-danger need stakes. After the end, actions are refused and queries
  still work, so the LLM can narrate the final state. A deadline can be added later if
  pacing needs it.

### D-30 A stranded ship loses, unless a starbase is in its sector, which transfers emergency energy instead — *Decided; the stranded test and amount are Proposed*
- **Alternatives:** an emergency tow home at a cost; accept a game that neither ends nor
  continues; losing even beside a starbase.
- **Why:** With no overdraft (D-24), running dry far from a starbase would otherwise leave
  a game that can't progress. Losing is the honest end, and it makes energy management a
  real stake (G-4, Loss Aversion). Beside a starbase, though, help is at hand: the
  transfer lets the ship move to dock or fight for an enemy-held base, so a starbase
  sector is always a refuge (Landmarks as Anchors). The test checks only the warp to the
  nearest *visible* other starbase sector, so it uses what the player knows.
- **Evidence:** Arithmetic: the longest warp to Star Central is from (9,9), distance
  `int(√50 × WARP_DISTANCE_SCALE)` = 70, costing 700, so `STARBASE_EMERGENCY_ENERGY` (1000)
  always clears the stranded test when Star Central is the fallback. In Star Central itself,
  with no other starbase visible, the floor reapplies after each action; Star Central never
  has enemies, so docking is always available there anyway.

### D-24 An action you can't afford is refused — *Decided*
- **Alternatives:** overdraft that damages the hull; clamping energy at 0 so the last shot
  is free.
- **Why:** G-4: every action is paid for. One rule for every action, as the scan already
  did. Energy never goes below 0.

### D-25 Enemies get a turn before you warp out — *Decided*
- **Alternatives:** warp is blocked while enemies are present; free escape.
- **Why:** Leaving a fight should cost something, without trapping the player (F-danger,
  Scarcity of Agency). Escape stays possible but risky.

### D-26 Sector layouts regenerate from the seed — *Decided*
- **Alternatives:** store every layout once seen; re-roll on every visit.
- **Why:** Leaving and returning shouldn't re-roll the board (map memory, F-discovery).
  Deriving the layout from `(seed, sector)` keeps the game value small. Stars and the
  starbase are placed before enemies, so terrain is stable even after kills. Enemies that
  moved return to their original cells; the ship's arrival cell can shift with the enemy
  count.

### D-27 Shields recharge from energy — *Decided, tuned by none yet*
- **Alternatives:** restore a fixed amount for free.
- **Why:** It ties shields to the energy economy (G-4): fighting drains the tank twice.
  `SHIELD_REPLENISH` and `SHIELD_ENERGY_PER_POINT` are starting values.

### D-11 Ship stats — *Decided, tuned by none yet*
- **Why:** Starting values. Energy is generous next to costs (see D-9). Unmeasured.

### D-12 Stardate display `99-9999-99` — *Decided*
- **Why:** Flavor (F-command). `STARDATE_START` is 7 digits padded to 8, so every display
  begins `01-`.

---

## Open questions

Each question lists its options and Claude's recommendation.

- **Q-17 How does the viewer's link stop being able to play?** The link holds the `game_id`,
  and anyone with a `game_id` can send MCP commands to that game, so sharing the link shares
  the controls. The designer's direction is for the link to hold a hash of the `game_id`, which
  the server can resolve and another player can't reverse. **Recommend** SHA-256 of the
  `game_id` as the store key, so MCP hashes the id it's given, a viewer presents the hash, and
  no mapping table is needed.
- **Q-19 Do players in one game see one view?** A frame is per game today. Multiplayer could
  share what any ship uncovers, or give each player their own fog, which would make the view
  per player. Deferred by the designer to multiplayer design, where what is shared is a central
  question. The frame and `view` are the places that would change.
- **Q-15 Can claude.ai and Claude Desktop connectors sign in to auth/ without dynamic
  client registration?** auth/ clients are created by an admin, with exact redirect URIs and
  no RFC 7591 registration (auth/ D-22). Options: (a) a pre-registered public PKCE client
  with the claude.ai callback; (b) add RFC 7591 registration and the RFC 8414 alias to auth/
  first. **Recommend testing (a)** with a stub Worker at `starreach.yuwakisa.com`, which
  serves RFC 9728 metadata and a `/mcp` that returns 401 or echoes `sub`. This gates
  deploying D-20.
---

## Deliberately left out
- Multiplayer (D-18).
- Persistence across restarts (non-goal in ONTOLOGY's Purpose).
- Enemy health and enemy types (D-19). Revisit if Enemy Identity becomes a driver.

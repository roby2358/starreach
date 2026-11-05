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
- **Alternatives:** separate MCP and HTTP servers on different ports (the README still
  describes MCP on 8001); a database-backed session store.
- **Why:** The simplest thing that runs under Claude Desktop (stdio, with HTTP on a
  background thread) and under the MCP Inspector (`--stream`). Persistence is a non-goal.
- **Evidence:** none recorded.

### D-20 Deploy into yuwakisacloud from this repo: Rust core in WASM, thin TypeScript Worker, one Durable Object per game — *Decided, unbuilt; gated on Q-15*
- **Choice:** Starreach stays in this repo and deploys into the yuwakisacloud Cloudflare
  account and zone at `starreach.yuwakisa.com`. A Rust `starreach-core` crate holds the
  rules. It is deterministic with a seeded RNG (Q-10) and is compiled to WASM behind one
  JSON function, `apply(state, command) -> result`, with one result shape (Q-12). A thin
  TypeScript Worker owns everything that touches the platform: streamable-HTTP MCP at
  `/mcp`, one SQLite Durable Object per game storing the state and the owner's auth/ `sub`,
  token checking with `auth-client` (copied into this repo for now), the auth service
  binding, and `public/` as static assets. The details are in `YUWAKISA.md`.
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
- **Evidence:** Modeled by: `python tools/model_balance.py` (2000 galaxies; unverified
  in play): about 199 enemies per galaxy (range 140–265), about 40 of 100 sectors have no
  enemies. The negative part of `ENEMY_BASE_ROLL` is what produces those empty sectors.

### D-4 Starbases are rare — *Decided, tuned by none yet*
- **Alternatives:** a fixed number of starbases; one per galaxy region.
- **Why:** Resupply should be a destination (G-4).
- **Evidence:** Modeled by: `python tools/model_balance.py` (unverified in play): about 3 starbases
  per galaxy including Star Central. In about 13% of galaxies Star Central is the only one.

### D-16 Fog of war over the galaxy — *Decided*
- **Alternatives:** a fully revealed galaxy.
- **Why:** F-discovery. Information costs something: a long-range scan costs `LRS_ENERGY`,
  and a warp costs a trip.

### D-15 One ray rule for all movement and fire — *Decided*
- **Alternatives:** pathfinding for movement; hit-scan weapons that ignore obstacles.
- **Why:** One code path. Stars and other ships become cover for both sides, which makes
  positioning matter (F-danger). Blocked fire is visible in the messages.

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

### D-7 Docking fully resupplies but needs a clear sector and an adjacent starbase — *Decided*
- **Alternatives:** partial resupply over time; docking under fire.
- **Why:** The starbase sector must be cleared first. Docking is the reward. Hull is not
  restored (see Q-7).

### D-8 A long-range scan costs energy and reveals the 3×3 block — *Decided*
- **Alternatives:** free scans; scans that cost time.
- **Why:** Information as currency (F-discovery). `LRS_ENERGY` is small next to
  `SHIP_MAX_ENERGY`, so the price is mild.

### D-9 Two weapons: blast (ranged, energy) and torpedo (unlimited range, limited ammo) — *Decided*
- **Alternatives:** a single weapon.
- **Why:** A real choice between them. The blast is limited by `BLAST_RANGE` and its cost
  rises with √range. The torpedo is cheap in energy but scarce (`SHIP_MAX_QUANTORPEDOES`)
  and reaches anything on the ray.
- **Evidence:** Modeled by: `python tools/model_balance.py` — a blast costs 1000 energy at range 1, 1414 at
  range 2, and 2449 at range 6. That is roughly 20–50 blasts per full tank. Blast time is
  1 up to range 2 and 2 from range 3 to 6. (The time formula's comment intends 3 at range
  6; see Q-11.)

### D-10 Enemies act on a stardate clock: two thirds fire, one third advance — *Decided, tuned by none yet*
- **Alternatives:** enemies act after every action; each enemy rolls its own action.
- **Why:** Time passing is the threat. Faster actions give you more shots before the enemy
  replies. Damage falls off steeply with distance, so range is protection.
- **Evidence:** Modeled by: `python tools/model_balance.py` — 2000 damage at range 1, 674 at 2, 356 at 3, 120
  at 6. With 5000 shields plus hull, about 2.5 point-blank hits destroy the ship. By
  reading the code: the clock fires only on 3-step subwarps (see Q-2).

### D-11 Ship stats — *Decided, tuned by none yet*
- **Why:** Starting values. Energy is generous next to costs (see D-9). Unmeasured.

### D-12 Stardate display `99-9999-99` — *Decided*
- **Why:** Flavor (F-command). `STARDATE_START` is 7 digits padded to 8, so every display
  begins `01-`.

---

## Open questions

Each question lists its options and Claude's recommendation.

- **Q-1 How does a game end?** Today nothing happens at hull 0, and clearing every enemy
  doesn't win. Options: (a) hull 0 = loss, all enemies destroyed = win; (b) add a stardate
  deadline; (c) leave it open-ended. **Recommend (a)**, with (b) later if pacing needs it.
- **Q-2 When do enemies act?** The clock resets after every action, and no single action
  except a 3-step subwarp reaches `EVENT_INTERVAL`. So blasts, torpedoes and scans never
  provoke a response. Options: (a) let time accumulate since the last enemy turn (reset only
  when events fire); (b) enemies act after every action that takes time; (c) lower
  `EVENT_INTERVAL`. **Recommend (a).** It keeps the "faster actions buy shots" design.
- **Q-3 What if energy is short?** Warp and subwarp drive energy negative. Blast and
  torpedo still succeed and clamp energy at 0, so the last shot is free. Options: (a) refuse
  any action you can't afford, as the scan already does; (b) allow overdraft that damages
  the hull. **Recommend (a).**
- **Q-4 Stars: block or kill?** The README says flying into a star ends the game. The code
  stops the ship one cell short. **Recommend keeping the stop** and correcting the README.
  Instant death from one misread coordinate is harsh when an LLM sits in the loop.
- **Q-5 Should sector layouts persist?** Every warp in rebuilds positions at random, so
  leaving and returning re-rolls the board, the ship's spot, and enemy positions. Options:
  (a) store each layout once seen; (b) seed each sector so it regenerates the same way;
  (c) accept re-rolls. **Recommend (b)** (it needs Q-10).
- **Q-6 What does ShieldReplenish do?** It is a stub. Options: (a) restore a fixed amount
  per firing; (b) shields drain energy to recharge. **Recommend (b)**: it ties shields to
  the energy economy (G-4).
- **Q-7 Should docking repair the hull?** Nothing restores the hull today. **Recommend yes.**
  Otherwise hull damage is a permanent countdown with no counterplay.
- **Q-8 What does the browser show?** `GET /state` shows its own `"default"` session, not
  the LLM's. The page assets aren't served by the app, and `index.html` links `styles.css`
  and `script.js` at the root while they live in `css/` and `js/`. **Recommend:** mount
  `public/` as static files, fix the links, and show the most recently active session
  (single player).
- **Q-9 Does the README or the code win on these?** The README says stars per sector 0–7
  (code: `STARS_PER_SECTOR` 2–8), the start at "[4,4:5,5]" (code: (4,4)), MCP on port 8001
  (code: 8000 or stdio), and the UI at `/static/index.html` (not served). **Recommend the
  code wins**, and the README is corrected.
- **Q-10 Seeded RNG and named constants?** Everything uses the global `random` module, and
  most numbers are inline literals. **Recommend:** give `Game(seed)` its own
  `random.Random`, and lift the constants into one `constants.py` under the names in
  ONTOLOGY's Numbers table. This unblocks R-20 and deterministic tests.
- **Q-11 Blast geometry.** Range and cost are measured to the *target cell*, not the enemy
  that is hit. Aiming 1 cell away at an enemy 1 cell away costs the same as a shot at range
  6 that hits that enemy. Blast time also peaks at 2, though the comment intends 3. Options:
  measure to the hit enemy; adjust `BLAST_TIME_*`. **Recommend measuring to the hit enemy**,
  and letting Q-2's fix decide whether the time matters.
- **Q-12 One result shape for every command?** Failures today are `distance: 0`,
  `success: false`, or a bare `error`, and the scan's failure omits `state`. **Recommend
  `{ok, error?, events, state, …}` everywhere.**
- **Q-13 Enemy advance with few enemies.** `int(n × ENEMY_ADVANCE_FRACTION)` is 0 for 1 or
  2 enemies, so small groups never close in. **Recommend:** each enemy advances with
  probability `ENEMY_ADVANCE_FRACTION`.
- **Q-15 Can claude.ai and Claude Desktop connectors sign in to auth/ without dynamic
  client registration?** auth/ clients are created by an admin, with exact redirect URIs and
  no RFC 7591 registration (auth/ D-22). Options: (a) a pre-registered public PKCE client
  with the claude.ai callback; (b) add RFC 7591 registration and the RFC 8414 alias to auth/
  first. **Recommend testing (a)** with a stub Worker at `starreach.yuwakisa.com`, which
  serves RFC 9728 metadata and a `/mcp` that returns 401 or echoes `sub`, before porting
  anything. This gates D-20.
- **Q-14 Can you warp away from a fight for free?** Warping never triggers an enemy turn,
  so every fight can be abandoned at no risk. Options: (a) enemies get a turn before the
  warp; (b) warp is blocked while enemies are present; (c) allow it. **Recommend (a).**

---

## Deliberately left out
- Multiplayer (D-18).
- Persistence across restarts (non-goal in ONTOLOGY's Purpose).
- Enemy health and enemy types (D-19). Revisit if Enemy Identity becomes a driver.

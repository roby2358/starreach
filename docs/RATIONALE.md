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

### D-20 Deploy into yuwakisacloud from this repo: Rust core in WASM, thin TypeScript Worker, one Durable Object per game — *Decided*
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
  multiplayer needs (D-18). The owner check and a signed-in browser view mean only the
  game's owner plays it (G-3).
- **Evidence:** Review of yuwakisacloud in `YUWAKISA.md`, with file citations. Nothing has
  been measured yet.

### D-21 Three layers: Rust core, platform-neutral TypeScript app, one adapter per platform — *Decided; core, app and Node adapter built, Cloudflare adapter built and deployed to starreach.yuwakisa.com*
- **Choice:** `core/` is the Rust crate (rules only, compiled to WASM). `app/` is a
  TypeScript package with no platform imports: it defines the MCP tools and the
  `instructions` prompt, loads the core, and talks to storage through a `GameStore`
  interface. `adapters/node/` runs the app over stdio and streamable HTTP with an in-memory
  store. `adapters/cloudflare/` is the only place Cloudflare APIs appear: the Worker, the
  Durable Object store, `wrangler.jsonc`, and the auth hook. npm workspaces join the TS
  packages. `just` recipes launch the Node adapter locally on `HTTP_PORT` and the Cloudflare
  adapter under `wrangler dev` (`just cf-dev`).
  In the Cloudflare adapter [P]: the Durable Object keeps the game JSON under one key of its
  SQLite-backed key-value storage, with no table of its own; the auth hook is one function
  that returns the refusing response or nothing, called before `/mcp` and before a viewer's
  socket upgrade; its tests run inside workerd under vitest with
  `@cloudflare/vitest-pool-workers`, while the other TypeScript packages keep Node's test
  runner; `wrangler.jsonc` keeps the route under `env.production` only, deployed with
  `wrangler deploy --env production`, as yuwakisacloud's Workers do; and the page is `public/`
  as static assets with the default asset-first routing, minus `instructions.txt`.
- **Alternatives:** a single Worker project (Cloudflare APIs spread through the code); an
  app with only the Cloudflare adapter, run locally under `wrangler dev` (no stdio for
  Claude Desktop).
- **Why:** The rules can't depend on a platform, and the MCP surface shouldn't either.
  Keeping Cloudflare in one directory means a platform change touches one adapter. The Node
  adapter keeps Claude Desktop (stdio) working without Cloudflare tooling. One key is enough
  for the store because a game is read and written whole, and the SQLite backend is what
  Cloudflare offers new Durable Object classes. Tests inside workerd exercise the real
  Durable Object storage and the bundled WASM, which Node can't. `wrangler` is pinned to
  4.90.0 to match yuwakisacloud, and the vitest pool (0.16.3) and `@cloudflare/workers-types`
  are the releases built against that `wrangler`, so one `workerd` is installed. Asset-first
  routing needs no `run_worker_first`: `/mcp`, `/health` and `/live/<view_id>` match no file,
  so they fall through to the Worker, and the page costs no Worker invocation. The adapter's
  test files share one worker and its storage, because the vitest pool doesn't support Durable
  Object WebSockets under per-file storage isolation.
- **Evidence:** Under `wrangler dev`, a game started over `/mcp`, its `viewer_url` opened in
  headless Chromium and went live, and the map updated after a `long_range_scan`;
  `/instructions.txt` answered 404. `wrangler deploy --env production --dry-run` reads the
  assets and resolves the Durable Object binding (2026-11-14).

### D-22 Games are addressed by an explicit `game_id` — *Decided*
- **Alternatives:** bind the game to the MCP connection (a reconnect loses the game unless
  auth ties it to a user).
- **Why:** G-1: the LLM holds the id and can resume. It maps directly onto one Durable
  Object per game (keyed by its `view_id`, D-32), and it works before auth exists. Once auth exists, the store also
  records the owner's `sub` (D-20).

### D-31 Dual display: the LLM plays over MCP, a read-only browser page follows over a WebSocket — *Decided; the routes and frame shape are Proposed*
- **Choice:** MCP stays the only way to act, with the LLM as the ship's computer. A browser
  page gets the current sector's board, the galaxy map, ship status and a survey panel for one
  game, pushed over a per-game socket, with the game's goals and the starting player's
  achievements (D-49). Everything but the achievements shows on one display, with the board as a
  tilted hologram in the middle, because the player otherwise doesn't need the mouse at all. The
  core makes the view (`view`, which can't change a game and shows only what's uncovered),
  the app layer makes frames and publishes after each accepted command, and each adapter holds
  the sockets. `new_game` reports the link (D-32), and the crew hands it to the captain.
- **Alternatives:** polling a `/state` route (delay, and load that grows with viewers);
  building the view in TypeScript from the Game (the app layer would have to read Game
  fields, and the hidden-sector rule would live outside the core); showing the most recent
  game with no id (works for one local player, but not on a shared server or in multiplayer);
  a separate port for the view (a Worker has one origin).
- **Why:** G-3. The split fits Cloudflare: a per-game socket list maps onto one Durable Object
  per game, which holds hibernating sockets there. That object reads its own game for the frame
  a viewer gets on connecting, and the starting player's object for the achievements (D-49). Both adapters close a
  viewer's socket on a frame over `VIEWER_MAX_FRAME_BYTES` [D], sized for a ping or a small view
  setting later. On Node the limit protects the process's memory; on Cloudflare the platform has
  already received the frame, so the limit's use there is to stop a misbehaving viewer from
  waking the hibernating object again and again. Several viewers per game already work, which
  multiplayer will need (D-18). Typed frames leave room for events on the same socket.
- **Evidence:** `just cc-test-page` drives the page in Chromium against the real server.
  The same page, unchanged, followed a game on the Cloudflare adapter under `wrangler dev`
  (2026-11-14). Not yet watched alongside a real LLM session.

### D-33 Enemy range, bearing and clear shot are computed in the core — *Decided*
- **Alternatives:** leave the LLM and each display to work them out from the map; compute them
  in the app layer or the page; a compass point for the bearing; degrees counter-clockwise or
  from the x axis.
- **Why:** Choosing blast or torpedo, or moving, turned on distances and lines of fire the LLM
  had to work out by hand from a grid and often got wrong (F-danger, G-4). The core already has
  the Euclidean distance and the ray, so `GameState.enemies` reuses them: the preview is the rule,
  and a clear shot is exactly what a torpedo at that cell would hit. The bearing is whole degrees
  clockwise from up because the board is drawn with row 0 on top, so "up" is what a captain and an
  LLM both call north, and clockwise is how a compass and a clock read. No command takes a bearing
  yet. The viewer page doesn't show the table; whether it should is open.

### D-42 The core counts what happens in a game, from one table of counters — *Decided; the labels, the count at arrival and the uncounted rescue are Proposed*
- **Choice:** A Game carries `counters`, a named count per kind of thing that happens, and every
  Result reports them in its state. The rule where the thing happens adds to its counter. One
  table in the core lists each counter's key, label and whether it may be a goal, and the Core API
  gives it out (`counter_table`), so the app layer and the displays read the list and never repeat
  it. The list: positive, and allowed as goals, are enemies destroyed, sectors cleared, sectors
  warped to, docks, starbases discovered, blasts that hit, torpedoes fired, long-range scans and
  games won; negative, never goals, are shield damage, hull damage, blasts that missed, games lost
  and times stranded.
- **Alternatives:** total kills and damage from the event messages (they are text, D-17, so a
  change of wording would change the count, and a client could count differently from another);
  count in the app layer from each command's report (the report doesn't carry the damage taken or
  what an enemy turn did, and the rules would be restated outside the core); a map from key to
  count instead of named fields (state must fit in a struct, and a misspelt key would count
  nothing, silently); structured events to count from (a larger change than counting needs).
- **Why:** A game recorded nothing about what happened in it. The counts have to be
  authoritative, so they come from the rules themselves, each at the single place its thing
  happens: Destroy enemy, the enemy fire rule, the Game end rule, the one place a sector becomes
  visible. They are state like any other, so a refused command leaves them alone and the same
  seed and commands give the same counts. A caller that wants to know what one command did takes
  the difference between two Results. The goal flag separates the things a player sets out to do
  from the things that happen to the ship: a goal is a positive objective, so damage taken, misses,
  losses and strandings can't be one.
- **Proposed details:** a label is lower case and reads after a number ("12 enemies destroyed"),
  so one label serves a list and a sentence. `sectors_warped` counts when the ship arrives, before
  the ambush, so a warp into a fatal ambush still counts; a warp the parting enemy turn stops
  doesn't. A stranded ship that a starbase rescues with emergency energy (D-30) isn't counted
  as stranded, because the game didn't end. `games_lost` rises on every loss, a stranding
  included. Damage is counted as the points actually taken, so a shot larger than what the hull
  had left counts only what was left. A starbase the ship is told of only through `reveal`
  counts; Star Central's never passes through it.
- **Stored games:** a game stored without `counters` doesn't parse and is not found (the Core
  API's rule for stored games). No migration.
- **Evidence:** R-36 tests; R-19 checks over random play that no counter decreases, and R-20's
  equal final states include the counters.

### D-43 Each counter's ladder scale and goal ceiling come by rule from modeled whole games — *Decided; the numbers tunable; the scripted captain and 0 for "not offered" are Proposed*
- **Choice:** Each row of the counter table carries two numbers. `scale`, the unit of the
  counter's ladder of lifetime totals, is the largest of 1, 10, 100, 1000 that is at most one
  tenth of the counter's median per game (1 when that is below 1). `goal_ceiling`, for a counter that
  may be a goal, is the counter's 25th percentile per game, so three games in four reach it; when
  that is below the counter's `scale` the ceiling is 0 and the counter is not offered as a goal.
  A counter that may not be a goal has ceiling 0. The per-game figures come from whole games
  played by a scripted captain (`just cc-model-games`), which prints what the rule gives beside
  what the table holds and marks a row that differs.
- **Alternatives:** a scale at most the whole median, not a tenth of it (a decade too coarse
  against the designer's examples: it gives enemies in 100s, docks in 10s and hull damage in
  1000s, and leaves a single rung under most goal ceilings); pick each scale and ceiling by hand (each would need a ruling, and again
  after every balance change); the mean in place of the median and 25th percentile (games that
  end early and games played to the end pull it apart); a ceiling at the median (half of all
  games would fall short of a goal at the ceiling, and a goal should not be too hard); no
  ceiling of 0, so every positive counter is always offered (a goal most games can't meet);
  an absent ceiling for counters that may not be goals (two shapes of row for one meaning:
  no goal amount fits under 0 either way).
- **Why:** The designer's examples fix the scales [D]: enemies destroyed in 10s, docks in 1s,
  shield damage in 1000s, hull damage in 100s. A tenth of the median per game is the rule that
  gives exactly those from the modeled figures, with 1000 as the largest unit. A ladder's rungs
  should arrive at a steady pace whatever the counter, so its unit follows what one game
  typically produces: a typical game climbs ten units or more, and the finer unit puts several
  rungs under each goal ceiling, so a goal can be small. A goal has to be reachable in a single game by most
  players, so its size is capped by what most games reach. Setting both by rule from a
  measurement means a change to the rules is followed by rerunning the recipe, not by a new
  ruling.
- **The scripted captain** *(Proposed)*: a yardstick, not an AI player. It uses the real
  commands and knows only the visible sectors. It fights its sector with the harness's battle
  policy (a blast inside the sure range, a torpedo beyond it, a subwarp to open a shot or close
  the range); docks whenever a starbase is in its cleared sector; scans when a neighbouring sector
  is hidden; then warps to the nearest sector known to hold enemies, or with none known the
  nearest hidden one. It goes to the nearest known starbase first when the hull is below half,
  when it carries fewer torpedoes than the target has enemies, or when the warp would not leave
  6000 energy for the battle plus the warp from there to a starbase. It leaves a battle only
  when its energy is down to the warp home plus 2500. It never withdraws for a low hull:
  modeled, withdrawing lost more games than fighting on, because the enemies take a parting
  turn (D-25). A game the captain can't finish stops at 5000 commands.
- **Evidence:** Modeled by: `just cc-model-games 1000` (a scripted captain, unverified in play).
  How the 1000 games ended: won 53.0% (median 411 commands), ship destroyed 46.6% (median 260
  commands), stranded 0.0%, the script gave up at the command cap 0.4%. A game ran a median of
  117 stardates and 377 commands (25th percentile 81 and 277; 9 in 10 under 143 and 446).
  Nearly half the games end early with the ship destroyed, which lowers the 25th percentiles;
  the captain also docks and warps more than a player who takes more risks would.

  | Counter, per game | mean | 10th pct | 25th pct | median | 90th pct | games with ≥ 1 | `scale` | `goal_ceiling` |
  |---|---|---|---|---|---|---|---|---|
  | `enemies_destroyed` | 159.4 | 66 | 127 | 179 | 217 | 100% | 10 | 127 |
  | `sectors_cleared` | 49.5 | 23 | 41 | 56 | 65 | 100% | 1 | 41 |
  | `sectors_warped` | 67.3 | 31 | 56 | 76 | 88 | 100% | 1 | 56 |
  | `docks` | 22.7 | 10 | 18 | 25 | 31 | 100% | 1 | 18 |
  | `starbases_discovered` | 3.3 | 2 | 3 | 3 | 5 | 98% | 1 | 3 |
  | `blasts_hit` | 72.8 | 28 | 57 | 80 | 103 | 100% | 1 | 57 |
  | `torpedoes_fired` | 86.6 | 37 | 67 | 97 | 120 | 100% | 1 | 67 |
  | `scans` | 35.9 | 21 | 33 | 39 | 44 | 100% | 1 | 33 |
  | `games_won` | 0.5 | 0 | 0 | 1 | 1 | 53% | 1 | 0 |
  | `shield_damage` | 55698.1 | 22599 | 44014 | 59519 | 78828 | 100% | 1000 | 0 |
  | `hull_damage` | 2776.7 | 972 | 2000 | 2482 | 4795 | 99% | 100 | 0 |
  | `blasts_missed` | 8.1 | 3 | 5 | 8 | 13 | 98% | 1 | 0 |
  | `games_lost` | 0.5 | 0 | 0 | 0 | 1 | 47% | 1 | 0 |
  | `times_stranded` | 0.0 | 0 | 0 | 0 | 0 | 0% | 1 | 0 |

  `games_won` may be a goal by its flag, but its 25th percentile is 0, so the rule gives it a
  ceiling of 0 and it is not offered. R-36 tests the table's shape (a scale is a ladder unit; a
  ceiling is 0 or at least the scale, and 0 where the counter may not be a goal); no test
  reruns the model, so after a balance change the recipe shows whether the table still follows
  the rule.


### D-44 An achievement is a lifetime total reaching a rung: one template of counter, scale and rung — *Decided; the list shape for the viewer is Proposed*
- **Choice:** A player has a lifetime total on every counter, over all of their games. Each
  counter has a ladder of rungs, its `scale` × 1, 2, 5, 10, 20, 50 and so on without a practical
  end, and an achievement is a total reaching a rung. Every counter accumulates, the negative
  ones included. Reaching a rung earns a message from Star Central in the command's events and
  nothing else. The ladder rule lives in the core beside the counter table, as a pure function of
  a counter and two totals; the app layer takes what a command counted as the difference between
  the game's counters before and after it, adds that to the totals of the player who issued the
  command, and appends one message per rung crossed. No MCP tool lists achievements: the viewer
  shows them.
- **Alternatives:** a hand-written list of named achievements, each with its own condition (every
  one a special case to write, test and balance, and the list ends); rungs at powers of ten only
  (ten times the play between one and the next, so the early ones come at once and then nothing
  for a long time); a fixed number of rungs per counter (a long-time player runs out); only the
  positive counters (the designer wants the negative ones, which are the funny ones); guards
  against repeating a cheap action such as scanning (the designer rules farming fine: a total is
  a count, not a score); storing the achievements a player has earned (they follow from the
  totals and the table, so a stored list could only disagree with them); an MCP tool that lists
  them (the designer keeps them on the viewer; in the conversation they arrive one at a time as
  Star Central's messages); totals kept for the player who started the game (a count belongs to
  whoever earned it, and the command's issuer is always known); counting in the app layer from
  event text (D-42).
- **Why:** One template makes the whole list from the counter table, so a new counter brings its
  achievements with it and none needs its own code. The 1, 2, 5 steps keep the rungs evenly
  spaced by ratio, close together for a new player and far apart for an old one, and the scale
  sets the first rung at about a tenth of a typical game (D-43), so the first commendation on a
  counter comes early in a player's first game. The ladder is in the core because the core holds
  the scales and the labels, and the same rungs size a game's goals (D-47). The totals are outside
  the core because the core is a pure function of one game and knows no player. A new game's
  counters start at 0 and only a command's own difference is added, so nothing is counted twice
  and a game left midway keeps what it already added.
- **Proposed details:** the app layer gives a player's achievements out as a row per counter with
  the total, the last rung reached and the next, which is what a display needs and no more. A
  command that counted nothing doesn't call the PlayerStore. Where there is no sign-in (the Node
  adapter) the totals belong to one player named `local`. A rung is crossed when the total passes
  it or lands on it, and one command can cross several, each with its own message, in the counter
  table's order and rising within a counter, after the game's own events.
- **Evidence:** R-37 (the ladder), R-39 (the totals), R-40 (the messages). The scales and their
  Modeled Evidence are D-43's. How the pace of commendations feels is not measured.

### D-45 Player totals behind a PlayerStore; on Cloudflare one Durable Object per player — *Decided; a key per counter is Proposed*
- **Choice:** The app layer reaches lifetime totals through a `PlayerStore` with two operations:
  read a player's totals, and add a set of increments, which answers with the touched counters'
  totals before and after. The Node adapter and the tests use an in-memory one, so locally the
  totals last as long as the process. The Cloudflare adapter keeps one SQLite-backed Durable
  Object per player, named by the player's `sub`, with a key per counter in its key-value
  storage. Adding a class to the Worker takes a new migration tag.
- **Alternatives:** Workers KV, or any eventually consistent key-value store (an addition is a
  read, a sum and a write; two commands of one player close together would both read the old
  total and one increment would be lost, and a read just after a write may return the old
  value, so a rung could be announced twice or never); D1 with one row per player and counter (a
  database and its schema for what is one small record per player, and no relation between
  players is ever queried); the totals inside each game's Durable Object (a total spans games);
  one Durable Object for all players (every command of every player through one object); the
  totals in one key holding the whole record (it works, but a key per counter is the shape the
  totals have, and an addition writes only the counters it touched); a store operation that only
  writes, with the app layer reading before and after (two round trips, and the read and the
  write could interleave with another command's).
- **Why:** A player's totals are one small record with one writer at a time, which is what a
  Durable Object is: its storage calls are synchronous, so an addition reads, sums and writes
  with no other request in between and none is lost, and the answer carries the before and after
  that the ladder needs. It is the pattern the games already use (D-32's object per game), with
  the same deploy and the same tests in workerd. The interface keeps the app layer the same on
  both platforms, and persistence in the local Node adapter stays a non-goal.
- **Stored data:** nothing to migrate: no player had totals before this.
- **Evidence:** R-39, in the app layer for the in-memory store and inside workerd for the player
  object, including 25 additions made at once all kept. Not exercised on deployed Cloudflare.

### D-46 Star Central's messages are a table of kinds, each with 20 wordings as data; the caller supplies the pick — *Decided; a second kind for negative counters and the wording form are Proposed*
- **Choice:** The core holds one table of message kinds. A kind has a key, the names of its
  placeholders, and exactly `WORDINGS_PER_KIND` wordings; a wording is a whole message with
  `{name}` placeholders. Making a message is picking a wording and filling the placeholders. The
  pick comes from a number in [0, 1) that the caller supplies; the app layer draws it from the
  platform's random numbers. Two kinds announce a lifetime total: `lifetime_commendation` for a
  positive counter's total reaching a rung, and `lifetime_notoriety` for a negative counter's.
  A third, `objective_met`, announces a game's goal (D-48).
- **Alternatives:** one fixed sentence built in code from the amount and the label (no variety,
  and a sentence assembled by concatenation can't be translated); the wordings in the app layer
  (the core announces a game's met goals from the same table, and it can't call up into the
  app); the pick drawn from the game's random stream (announcing something would then change
  the enemies' next rolls, so the same seed and commands would play differently for a player
  near a rung than for one far from it, and R-20's determinism would depend on a player's
  history); a sub-stream derived from the game's seed for lifetime messages (a lifetime total
  belongs to no game); one kind for every counter (a wording that congratulates reads wrongly
  for 5000 shield damage taken, and one neutral enough for both is flat for both); a tone flag
  on each wording within one kind (fewer than 20 wordings for each tone, and a second thing to
  dispatch on); wordings that put the amount before the label, as "5000 enemies destroyed" (a
  label is plural, so the first rung of a scale of 1 would read "1 games won").
- **Why:** The designer wants variety now and a path to localization later: kinds keyed by name
  and wordings as data are that path, since a second language is another list of wordings under
  the same key with the same placeholders. Taking the pick from the caller keeps the core a pure
  function and leaves the game's stream alone, so a game plays the same whatever is announced,
  and a test pins the wording by passing the number. Which kind a counter takes is decided at
  one place, from the counter table's goal flag, which is the table's mark of a positive
  counter (D-42). Every wording names the label as a heading of the record ("your lifetime tally
  of games won has reached 1"), which reads right for every label, for an amount of 1, and
  without a label starting a sentence in lower case.
- **Evidence:** R-38 tests: 20 distinct wordings per kind, each with its placeholders, each
  filled. Whether the wordings read well in play is unmeasured (U-14 is manual).

### D-47 Three goals per game, each a random rung of a different counter under its ceiling, chosen from the seed — *Decided; uniform picks, the GoalState shape and the side stream are Proposed*
- **Choice:** A new game sets `GOALS_PER_GAME` goals. Each is an amount of one counter to reach
  within that game, measured on the game's own count. The counters are different, picked
  uniformly from those that may be goals and whose `goal_ceiling` holds at least one rung of
  their ladder; the amount is picked uniformly from the rungs at or below the ceiling. The core
  chooses them at `new_game` from the seed, through a side stream of their own, and keeps them
  in the Game as `{counter, amount, met}`. Every Result shows them in `state.goals` with the
  counter's label and the count so far, and `new_game`'s report lists them. Meeting a goal earns
  Star Central's message (D-48) and nothing else. Play toward a goal is ordinary play, so it
  counts toward the lifetime total as well (D-44).
- **Alternatives:** goals as lifetime amounts (not reachable in one game, and that is what the
  ladder already is); always the highest rung under the ceiling (the same amount every time a
  counter comes up, and the hardest one: a quarter of modeled games fall short of the ceiling
  itself); an amount anywhere up to the ceiling, not a rung (odd numbers such as 37, and a
  second scale of amounts beside the ladder's); two goals allowed on one counter (the smaller
  is met on the way to the larger); goals chosen by the app layer (they would need a second
  source of randomness and a place to keep them outside the Game, and a seed would no longer
  give a whole game); drawing the choice from the game stream (every seed's enemy rolls would
  shift, so every seeded test and every Modeled figure would move, for a choice that has
  nothing to do with play); keeping the count inside the goal (it is the game's counter; a
  copy could only disagree); a reward for meeting a goal (the designer wants none for now);
  storing the counter as a bare key (a goal on a key that names no counter would sit unmet
  for ever, silently).
- **Why:** A game's only stated aim was to clear the galaxy, which roughly half the modeled games
  never do. Three small aims give each game something to build toward and something to finish
  that is short of winning, and they point at ordinary play, so they need no new rule of their own:
  a counter, a ladder and a ceiling already exist (D-42, D-43). Sizing a goal by the game's own
  count makes it the same for a new player and an old one. Different counters make the three
  aims pull in different directions. Rungs keep the amounts round and few. The ceiling keeps
  the largest amount within what three modeled games in four reach, and a random rung under it
  makes most goals smaller than that: the designer asked for goals that are not too hard, and
  to try a random rung and see how it plays. Choosing from the seed keeps the core a pure
  function and makes a game reproducible from its seed, goals included; the side stream means
  the galaxy and the play of a seed are exactly what they would be without goals (R-41).
- **Proposed details:** the picks are uniform, over counters and over a counter's amounts. A
  Result shows a goal as `{counter, label, count, amount, met}`, so a client can present and
  track it without the counter table; `count` goes on rising after the goal is met. The goals
  keep the order they were picked in. A goal's counter travels as its key and is read back
  through the counter table, so a stored goal on an unknown counter doesn't parse.
- **Stored games:** a game stored without `goals` doesn't parse and is not found (the Core
  API's rule for stored games). No migration.
- **Evidence:** R-41 and R-42 tests. Modeled by: `just cc-model-games 1000` (a scripted
  captain, unverified in play). The captain doesn't know its goals and plays as it always does,
  so these are the shares that ordinary play meets. The per-game counter figures are D-43's and
  are unchanged by the goals.

  | Goal on | A goal in, of games | Met | Met, by amount |
  |---|---|---|---|
  | `enemies_destroyed` | 38.3% | 90.3% | 10: 96%, 20: 97%, 50: 92%, 100: 78% |
  | `sectors_cleared` | 38.8% | 98.2% | 1: 100%, 2: 100%, 5: 99%, 10: 98%, 20: 94% |
  | `sectors_warped` | 36.3% | 94.8% | 1: 100%, 2: 100%, 5: 100%, 10: 97%, 20: 97%, 50: 77% |
  | `docks` | 37.1% | 96.5% | 1: 100%, 2: 97%, 5: 96%, 10: 93% |
  | `starbases_discovered` | 36.1% | 95.3% | 1: 99%, 2: 91% |
  | `blasts_hit` | 37.7% | 94.2% | 1: 100%, 2: 100%, 5: 100%, 10: 95%, 20: 91%, 50: 80% |
  | `torpedoes_fired` | 37.8% | 96.0% | 1: 100%, 2: 100%, 5: 98%, 10: 97%, 20: 97%, 50: 83% |
  | `scans` | 37.9% | 98.7% | 1: 100%, 2: 100%, 5: 99%, 10: 99%, 20: 96% |

  Each of the eight offered counters is a goal in three games of eight by the rule (37.5%), and
  the sample is near it. Games that met none, one, two and all three of their goals: 0.5%, 2.5%,
  7.0% and 90.0%. By arithmetic on the table, 41% of goals ask for 1 or 2, which ordinary play
  meets within a few commands; whether that reads as too easy is for play to say (X-6 is
  unmeasured).

### D-48 The core announces a met goal with its own kind of message, worded from a side stream of the seed — *Decided; the stream and the wording form are Proposed*
- **Choice:** After every accepted action, after the Game end rule, the core checks the goals. A
  goal not yet met whose counter has reached its amount becomes met, for good, and one
  `objective_met` message joins the command's events after the game's own. The kind has its own
  `WORDINGS_PER_KIND` wordings, which speak of this patrol's orders. The wording is picked by
  the first number of a side stream made from the seed and the goal's place among the game's
  goals. A lifetime message for the same command comes after it, from the app layer (D-44).
- **Alternatives:** the pick supplied by the caller, as for a lifetime message (`apply` would
  take a number on every command, and its result would depend on something that is neither the
  game nor the command); the pick drawn from the game stream (meeting a goal would move the
  enemies' next rolls, so play would depend on which goals a game has, and the modeled figures
  with it); the wording fixed by the goal's place alone (every game's first goal announced in
  the same words); the roll stored in the Goal (state that follows from the seed); the app
  layer announcing a goal by comparing `state.goals` before and after (the wordings and the
  rule would sit on two sides of the boundary, and another client of the core would repeat
  it); reusing `lifetime_commendation` (a goal and a lifetime rung on one counter can arrive
  in one command, and the designer wants them told apart); checking the goals on queries too
  (a query changes nothing, D-29).
- **Why:** A goal belongs to one game, so everything about it can come from that game: the
  check from its counters, the wording from its seed. That keeps `apply` a pure function of
  the game and the command, makes the same seed and commands give the same events as well as
  the same state, and leaves the game stream alone, so a game plays the same whatever its
  goals are and whenever they are met (R-42). A lifetime total belongs to no game, which is
  why its pick stays with the caller (D-46). A kind of its own lets the two messages differ in
  voice: one is about today's orders, the other about a career.
- **Proposed details:** the side stream is the one sectors use, keyed by the seed and an
  index: sectors take 1 to 100, the goals stream the next index, and the goals' message
  streams the ones after it. The wordings take the label as a heading with the amount apart
  from it, as the lifetime kinds do, since a goal's amount can be 1. A goal met by the action
  that ends the game is still announced, after the ending.
- **Evidence:** R-42 tests, and R-38 for the kind's 20 wordings. Whether the wordings read
  well in play is unmeasured (U-15 is manual).

### D-49 The viewer shows the game's goals and the achievements of the player who started it — *Decided; the frame's shape, the panels' placement, the order's measure and the `#achievements` link are Proposed*
- **Choice:** The viewer page shows the game's three goals, always, and the player's
  achievements in a panel that a button opens. There is no player page and no sign-in in the
  browser. The goals travel in the GameView, which the core makes. The achievements travel in
  the same view frame, added by the app layer from the PlayerStore, and they are those of the
  player who started the game: `new_game` stores that player beside the game in the GameStore,
  never inside the Game. Both frames carry them, the one after a command and the one a viewer
  gets on connecting. The frame holds rows, never the player's id. The stored player decides
  nothing else: no command is checked against it.
- **Alternatives:** a player page behind sign-in (a second page and a sign-in flow in the
  browser, for a list that is not personal information, when the viewer's link is already
  unguessable); the achievements of whoever issued the command (a viewer that connects has no
  command in hand, so its first frame would have none, and the list would change with the
  issuer); the player inside the core's Game (the core is a pure function of one game and knows
  no player, D-44); the player's id in the frame for the page to look up (the id is the auth/
  `sub`, and nothing on the page needs it); a second frame type or an HTTP route for
  achievements (a second message to keep in step with the first; typed frames leave room to
  split them later); the goals rebuilt by the app layer from a Result (the app layer would
  read the Game's state to make a view, which is the core's job, D-31); the achievements always
  open (a row per counter pushes the map and ship status off a laptop screen); a modal dialog
  (it covers the board and holds the page until dismissed); a separate store keyed by `view_id`
  for the player (a second record to keep in step with the game, D-32).
- **Why:** G-3 and F-command. The designer decided the viewer shows both: the link is a one-way
  hash of an unguessable id (D-32), and a path of achievements names nobody. A viewer has to see
  the same list whenever it connects, so the list must belong to the game, and the player who
  started a game is the one fact about a player a game can keep without the core knowing it.
  With one player per game that is also the player commanding (D-18). The frame after a command
  is made after the totals move, so the page shows a rung in the frame of the command that
  reached it. On Cloudflare the game's object reads the achievements from the player's object
  with its other requests held back (`blockConcurrencyWhile`): the read is the one await between
  reading the game and sending the frame, and a command stored or published during it would
  otherwise be missed by the new socket, or be overtaken by this older frame. It is held per
  connecting viewer, not per command.
- **Proposed details:** the frame is `{type: "view", view, achievements}`. The objectives sit
  under the survey on a wide screen, where the side column has room, and between the board and
  ship status on a phone, where they are short enough to leave the board and the gauges on the
  first screen. The achievements open as a sheet fixed over the lower right (the lower screen
  on a phone), which scrolls inside itself, so opening it moves nothing, and at a laptop
  screen's size it lies under the galaxy panel and beside the board. The order is by how far
  each total has come from its last rung toward the next, as a share; a total that has just
  reached a rung therefore drops to the end, and the flash is what marks it. The page labels
  the panels Objectives and Achievements, the words the crew uses. A viewer link ending
  `#achievements` opens with the panel showing, which is how the committed screenshot script
  pictures it.
- **Stored data:** a game stored before this has no player beside it and answers "Game not
  found". No migration.
- **Evidence:** R-28 (the goals in the view), R-43 (the stored player and both frames, in the app
  layer, on Node's sockets and on the Durable Object's), U-13 and U-16 in headless Chromium.
  Screenshots at 1100×800 and 375×700 were looked at (2026-11-16). Not watched alongside a real
  LLM session, and not exercised on deployed Cloudflare.

### D-32 The viewer's link holds the SHA-256 of the `game_id`, called the `view_id` — *Decided*
- **Choice:** `view_id` is the hex SHA-256 of the `game_id`, computed in one app-layer function
  (`viewId`, Web Crypto). The GameStore and the Viewers are keyed by `view_id`. An MCP call
  hashes the `game_id` it is given to find its game, and a viewer presents the `view_id`
  directly: the link is `<origin>/viewer?view=<view_id>` (D-40) and the socket is `/live/<view_id>`. Sharing
  the link shares the view and not the controls, because a `view_id` can't be reversed to a
  `game_id`, and passed as a `game_id` it hashes to a key nothing is stored under.
- **Alternatives:** a random view token with a mapping table to the `game_id` (a second
  record to store and keep in step, and on Cloudflare a second Durable Object lookup); an HMAC
  of the `game_id` under a server secret (needs secret storage and keeps the same
  lookup-by-hash shape, with no gain while the `game_id` itself is unguessable); keeping the
  `game_id` in the link (the viewer link would carry the controls).
- **Why:** G-3 and G-1 together: the link must be shareable and the `game_id` must stay private.
  A `game_id` is `crypto.randomUUID`, 122 random bits, so its hash can't be searched for it. A
  plain hash needs no table and no secret, and it works the same on Node and Workers. It also
  gives the Cloudflare adapter its key: one Durable Object per `view_id`.
- **Evidence:** R-18 and R-21 tests: the link and socket path never hold the `game_id`, and a
  `view_id` sent as a `game_id` returns Game not found.

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
- **Evidence:** see D-38 for the count and the placement that now make them rare.

### D-38 Three to five extra starbases, placed apart by rejection sampling — *Decided; metric, one per sector and enemy handling Proposed*
- **Alternatives:** an independent roll per sector (a galaxy could have none beyond Star
  Central, or several bunched together); a fixed count; Poisson-disc sampling; retrying until
  every starbase fits.
- **Why:** Designer decision. A count drawn from `STARBASE_EXTRA_MIN..=STARBASE_EXTRA_MAX`
  guarantees resupply exists to be found (G-4) while keeping it rare (D-4). Each starbase keeps
  `STARBASE_MIN_SPACING` from the others, so they spread over the galaxy instead of clustering.
  Rejection sampling is the simplest way to get that. Stopping after `STARBASE_PLACE_TRIES`
  misses, with fewer starbases, bounds generation time and cannot hang on a crowded board. It
  costs only a rare shortfall. Euclidean distance matches warp distance; a sector holds at most
  one starbase; a starbase sector keeps its generated enemies and stars (the player must clear it
  to dock).
- **Evidence:** Modeled by: `just cc-model-balance 2000` (unverified in play): 5.01 starbases per
  galaxy including Star Central, range 4–6 (the full 3–5 extra, so placement never ran out of
  tries).

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

### D-19 Enemies are anonymous and have no hull: a hit kills or does nothing — *Decided*
- **Alternatives:** enemy health; named enemy races (the names Rasphyx, Geakthon,
  Deltaclast, Auvoros and Raskaos appear in a code comment).
- **Why:** Simple, and the designer doesn't want to track enemy damage. Each kill is clearly
  reported by position. Blast uncertainty comes from its kill chance (D-36), not from wounds.

---

## Actions

### D-5 Warp time grows with the logarithm of distance, the next sector is about a day away, and warp energy is a flat price per startick — *Decided; `WARP_TIME_K` and `WARP_ENERGY_PER_TICK` tunable*
- **Alternatives:** time linear in distance; time as the square root of distance, as for
  constant acceleration; a logarithm plus a fixed constant; a flat time per jump whatever the
  distance; energy linear in distance.
- **Why:** The ship accelerates exponentially to the midpoint of the journey and decelerates
  exponentially from it, which makes time logarithmic in distance [D]. The `+ 1` inside the
  logarithm stands for crossing the current sector at subwarp before the drive engages, so it
  does the work a separate fixed constant would, with one number. Sectors are therefore far
  apart, not touching, though the game doesn't say so. A whole battle is over long before a
  warp to the next sector ends [D], so the galaxy feels big and fighting is brief next to
  getting there. Energy is a flat price per startick of the journey, so it follows time and is
  logarithmic in distance too [D]: one long jump beats several hops in both time and energy,
  which linear time or linear energy would not give, and a flat time per jump would make
  distance mean nothing. Warps are dear against the tank (`SHIP_MAX_ENERGY`): energy is the
  tight resource and starbases matter [D]. The time of a warp starts no stardate events: the
  event clock restarts on arrival, so enemies in the new sector don't get turns for the
  journey [P].
- **Shields on a warp:** the ship arrives with its shields recharged to full, at the shield
  price (D-27), as far as its energy allows [D]. The journey is hundreds of times longer than
  a recharge takes in a sector, so counting intervals would only spell out "full". The
  alternatives were no recharge in transit, which leaves the ship as it left after a day's
  travel; a recharge counted per `EVENT_INTERVAL` of the journey, which gives the same result
  with more arithmetic; and a free recharge, which breaks "every action is paid for" (G-4).
  The hull is not repaired: that is what docking is for (D-7). Leaving a battle and coming
  back therefore resets the shields for at most 300 energy plus the two warps, and the
  enemies still get their turn before the ship leaves (D-25). The recharge is charged on top
  of the warp: the warp is refused only when its own cost can't be paid, the stranded test
  (D-30) counts the warp alone, and `report.energy_cost` is the warp's, with the recharge told
  in the events [P].
- **Evidence:** Modeled by: `just cc-model-balance 2000` (formula and a scripted captain,
  unverified in play).
  - Warp time and energy: next sector 416 starticks (1.04 stardates), 4160 energy; diagonal
    529 (1.32), 5290; 5 sectors 1075 (2.69), 10750; corner to corner 1572 (3.93), 15720. Five
    hops in a line are 2080 starticks and 20800 energy against 1075 and 10750 for the one
    jump. A full tank is 12 next-sector warps or 3 corner-to-corner warps with nothing else
    spent.
  - Battles: a fresh ship that takes the nearest enemy it has a clear shot at (a blast within
    `BLAST_SURE_RANGE`; beyond it a torpedo while any remain, else a subwarp closer) clears a
    sector in a median of 5 starticks and within 10 in 9 of 10 battles, for a median of 1878
    energy and within 5543 in 9 of 10. A sector of 7 enemies takes a median of 10 starticks
    and within 16 in 9 of 10; sectors of 8 or 9 enemies, under 1 in 100 battles, within 19 to
    21. The next sector is some 80 typical battles away. The slowest battles (up to 200
    starticks) are the script stepping aside repeatedly for a clear shot, not a measure of
    play.
  - Energy to a starbase, from every sector without one: to the nearest starbase a mean of
    6832, median 7050, within 9660 from 9 of 10 sectors, at most 12530 (25% of a full tank);
    to Star Central alone, the one a new captain knows, a mean of 9230 and the same most.
  - One tank: a new game's ship that goes from each enemy sector to the nearest next, clearing
    each, and never docks or scans (the script reads the galaxy's records to pick sectors)
    clears a median of 5 enemy sectors (4 to 6 in 8 of 10 games, at most 8). A captain who
    presses on while the next warp is affordable ends stranded in 86.5% of games and destroyed
    in 10.6%. One who warps on only while the ship would arrive holding the 9-in-10 battle
    energy and the warp from there to the nearest starbase it knows clears the same median of
    5, turns for home in 85.5% of games, is destroyed in 8.1% and is still stranded in 5.5%,
    when a battle costs more than the reserve. Neither repairs its hull, so the destroyed
    share overstates a captain who docks.

### D-6 Subwarp is shortened while enemies are present — *Decided*
- **Alternatives:** a fixed movement range; movement costed by energy alone.
- **Why:** In combat you can't simply fly away from enemies within a sector, so each move
  is a tactical step (F-danger).

### D-7 Docking fully resupplies and repairs, but needs a clear sector and an adjacent starbase — *Decided*
- **Alternatives:** partial resupply over time; docking under fire; no hull repair.
- **Why:** The starbase sector must be cleared first. Docking is the reward. It restores
  the hull too, because otherwise hull damage is a countdown with no counterplay, and
  "retreat to resupply" (DYNAMICS) needs a resupply that matters.

### D-8 A long-range scan costs energy and a round of time, and reveals the 3×3 block — *Decided*
- **Alternatives:** free scans; scans that cost energy only (the earlier rule); a scan that
  gives enemies a turn only while the sector is hostile, with no time passing in a cleared one.
- **Why:** Information as currency (F-discovery). `LRS_ENERGY` is small next to
  `SHIP_MAX_ENERGY`, so the energy price is mild. With no time cost, scanning mid-fight was
  free: the enemies never acted (F-danger). `LRS_TIME` equals `EVENT_INTERVAL`, a full round,
  so enemies present always act after a scan [T]. In a cleared sector the stardate still
  advances, by the same rule as every other timed action; nobody is there to act, so nothing
  happens [D]. One path (`stardate_events`) serves all timed actions.

### D-9 Two weapons: blast (ranged, energy) and torpedo (unlimited range, limited ammo) — *Decided*
- **Alternatives:** a single weapon.
- **Why:** A real choice between them. The blast is limited by `BLAST_RANGE`, its cost
  rises with √range and its kill chance falls with range (D-36), all measured to the enemy it
  hits, not to the aimed cell (so aiming past a near enemy costs what hitting it costs). The
  torpedo is cheap in energy but scarce (`SHIP_MAX_QUANTORPEDOES`), reaches anything on the ray,
  and always kills.
- **Evidence:** Modeled by: `just cc-model-balance 2000` — a blast costs 1000 energy at range 1, 1414 at
  range 2, 2449 at range 6 and 3000 at range 9. That is roughly 16–50 blasts per full tank. Blast
  time is 1 up to range 2, 2 from range 3 to 6, and 3 from range 7 to 9.

### D-10 Enemies act on an accumulating stardate clock; each enemy advances with probability `ENEMY_ADVANCE_FRACTION`, else fires — *Decided, tuned by none yet*
- **Alternatives:** a clock that resets after every action (then no single action but a
  3-step subwarp ever fills it, so shots never draw a reply); enemies act after every
  action; lowering `EVENT_INTERVAL`; a fixed split of `int(n × ENEMY_ADVANCE_FRACTION)`
  advancers (0 for 1–2 enemies, so small groups never close in).
- **Why:** Time passing is the threat, and it adds up across actions, so every action that
  takes time brings the next enemy turn closer. Faster actions still buy more shots before
  the reply. A per-enemy roll lets small groups advance too. Range is protection: damage
  falls off past `ENEMY_FIRE_NEAR_RANGE` (D-39).
- **Evidence:** none yet for the clock itself; the damage numbers are under D-39.

### D-34 An advancing enemy approaches 25% oblique left, 50% head-on, 25% oblique right — *Decided; the geometry is Proposed*
- **Alternatives:** always head-on (the old rule: an enemy often stepped into the line of a shot already aimed at it, easy to predict and cover); a target cell offset perpendicular to the ray; a sidestep then advance; a different split.
- **Why:** Raxxon fire is more range-sensitive than our blasters, so enemies want to close, but not predictably down the shot line. The choice uses the game's seeded rng, so the same seed and commands give the same state. Serves readable consequences (still always closer or no farther, never through obstacles) with some variable reinforcement. [P] Geometry: each step is the head-on step turned one octant (45 degrees) left or right, or head-on when the turned step would be farther from the ship; a blocked step means it stays.
- **Evidence:** Tested by R-30 (shares over 4000 seeds, never farther, never through obstacles).

### D-35 On arrival each enemy fires with probability 0.3 — *Decided; the placement is Proposed*
- **Alternatives:** no arrival fire (the old rule: the player always got the first shot, and every hostile sector in the first live game was entered unharmed); every enemy gets a full EnemiesTurn on arrival; only enemies within a range fire; scanning first lowers the chance.
- **Why:** Designer decision: 30% of enemies fire when you enter the sector. Entering a hostile sector should cost something, but a full turn would make warping into a crowd near-certain ruin. Rolls use the game's seeded rng, and shots reuse the enemy fire rule, so range and cover still matter. [P] The ambush runs after the sector is instantiated and before the starbase hail, enemies in `enemies_yx` order, and stops once the hull is 0; the usual end-of-action check then loses the game.
- **Evidence:** Tested by R-31 (share over 4000 seeds, damage equals the fire formula, a fatal ambush loses).

### D-36 A blast kills with a chance that decays exponentially from 0.9 at range 4 to 0.1 at range 9 — *Decided*
- **Choice:** Blasts stay all-or-nothing (D-19). A blast kills with `BLAST_KILL_CHANCE_NEAR` up to
  `BLAST_SURE_RANGE`, falling to `BLAST_KILL_CHANCE_FAR` at `BLAST_RANGE`, which moves out to 9 so
  the far end of that falloff is reachable. A miss still costs the energy and the time, leaves the
  enemy where it was, and is reported as an event and as `report.destroyed`. One draw from the
  game's rng per accepted blast. Between `BLAST_SURE_RANGE` and `BLAST_RANGE` the chance decays
  exponentially, multiplied by the same ratio for each cell: about 0.58 at 5, 0.37 at 6, 0.24 at 7.
- **Alternatives:** enemies with a hull and blasts that deal randomized damage falling with range,
  so a long blast may only wound (more state to track, which the designer declined); randomizing
  only the blast's energy cost (no change in the fight); keeping certain kills within range 6 (the
  first live game: every blast killed and standing off at 4+ made combat nearly free); a linear
  falloff (0.77 at 4, 0.5 at 6: long shots stay too good, and standing off stays cheap); a sigmoid
  (holds near 0.9 past 4 and drops late, which blurs the effective range and needs a midpoint
  and steepness to tune).
  An effective range of 3 (the old rule: no more reach than raxxon fire had, so the player had no
  edge in a crowded sector).
- **Why:** Designer decision: the effective range is 4, but 5 or 6 is still a decent shot, and a
  long shot is a gamble. Raxxon fire is effective to 2 and falls off after it (D-39), so the
  two extra cells give the player the edge in a busy sector: at range 4 a blast is as sure as at 1,
  while an enemy shot there has already started its falloff (about 788 against 1191 at 3, D-39). Exponential decay drops fastest just past 4, so closing that first cell or
  two pays most, and it needs no constants beyond the two end points. Missing makes closing in worth its danger (enemy fire is heavy inside its near range,
  D-39), gives torpedoes, which always kill, a reason to be saved, and brings the near-miss into
  play. A paid miss keeps every action costing something (G-4).
- **Evidence:** Modeled by: `just cc-model-balance 2000` (formula, unverified in play) — kill chance
  90% to range 4, 58% at 5, 37% at 6, 24% at 7, 16% at 8, 10% at 9. Expected energy per
  kill (cost ÷ chance): 1111 at range 1, 1924 at 3, 2222 at 4, 3855 at 5, 6553 at 6, 10983 at 7,
  18223 at 8, 30000 at 9.
  Before, every blast killed: 2449 per kill at range 6. Tested by R-9 and R-32.

### D-37 Enemy fire damage varies by a factor in 0.75..1.25 — *Decided; the band is Proposed*
- **Choice:** Each enemy shot multiplies its damage by a uniform factor in
  `ENEMY_FIRE_VARIANCE_MIN..ENEMY_FIRE_VARIANCE_MAX`, drawn from the game's rng, then rounds. It
  lives in the enemy fire rule, so ambush fire (D-35) varies too. [P] The band is ±25%, and the draw
  is made for every shot, blocked or not, which keeps the draw count simple.
- **Alternatives:** fixed damage (the old rule: every shot at a range dealt the same, so a player
  could compute exactly how many hits the shields would take); a band that widens with range; a
  normal distribution.
- **Why:** Variable reinforcement and a little uncertainty in "can I take one more volley" (F-danger),
  without changing the mean, so D-39's range profile still sets the shape of a fight.
- **Evidence:** Modeled by: `just cc-model-balance 2000` (formula, unverified in play) — damage
  1500–2500 at range 1, 1350–2250 at 2, 893–1489 at 3, 259–431 at 6, 75–125 at 9. Tested by R-14
  and R-33.

### D-41 MCP sign-in through auth/, with Starreach as an OAuth resource server — *Decided; the protocol details Proposed*
- **Choice:** on Cloudflare, `/mcp` serves only a signed-in player. Without a token it answers 401
  with `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp", scope="starreach:play"`;
  that RFC 9728 metadata names auth/ as the only authorization server. The MCP client signs the
  player in at auth/ ("Sign in with Bluesky" there, which goes through bskyoidc to Bluesky) and
  comes back with a bearer token. Starreach verifies it offline with auth-client, copied in with
  its source commit, and requires the `starreach:play` scope; the token's `sub` is the player, which
  a `whoami` tool reports. An MCP client identifies itself to auth/ with its own Client ID
  Metadata Document, which auth/ accepts for Starreach's resource because that resource is open
  to such clients; the player adds only the MCP URL, and allows the client once on auth/'s
  confirmation page. auth/ also holds one public PKCE client for Starreach per environment
  (`cZpqWEBNv9M7xQRl` in production, `D21zauaGSjnD3U77` in the local seed) for clients that
  cannot use a metadata document and for `just cc-dev-token`. A token is for Starreach when its `aud` is the
  MCP endpoint's canonical URL (`STARREACH_RESOURCE`, which auth/ writes when the client names
  the resource, as MCP clients do) or that client id (when it names none) [D]; both name Starreach
  and nothing else. The viewer stays open, and the Node adapter has no sign-in.
- **Alternatives:** keeping `/mcp` open beside a signed-in endpoint while sign-in was tried (the
  designer declined: no need to preserve open play); signing in directly against bskyoidc (no
  shared identity across yuwakisa apps, and its token output isn't built for a resource server);
  Starreach running its own OAuth flow (yuwakisacloud's rule: consumers only verify tokens);
  the pre-registered client alone (it works, but every player must paste a client id into
  "Use your own OAuth client", and Claude Code needs a fixed callback port); dynamic client
  registration (auth/ would keep a row per registration, written by anyone); one client id for every environment (the designer chose separate ones, so a
  local token can never pass production's audience check); accepting only the client id
  as audience (it worked while auth/ dropped `resource`, but the client id then does two jobs, and it
  cannot work once clients sign in under their own ids); accepting only the resource URL (tokens
  from clients that name no resource, and those issued before auth/ bound resources, would fail);
  auth/ translating the resource back to the client id for `aud` (declined: the URL is the MCP
  spec's default shape, which suits a reference implementation).
- **Why:** Designer decisions: sign in through auth/ with Bluesky, MCP only, on `/mcp` itself.
  Starreach is meant to be a worked example of an MCP server using auth, and achievements will track
  players by `sub`.
- **Evidence:** R-35 (401, metadata, offline verification, scope, `whoami`).
  `SMOKE_TOKEN=$(just cc-dev-token) just cc-smoke http://localhost:8787` against a local auth/
  passed end to end on 2026-11-15: a real auth/ token for the dev user, verified through the
  service binding, a game played over `/mcp`, and `whoami` gave its `sub`. In production on
  2026-11-15 the designer added the connector in claude.ai with "Use your own OAuth client" and
  the production client id, signed in with Bluesky through auth/, and played. Later that day,
  with auth/ accepting metadata documents, the designer connected a Claude Desktop connector
  that had only the URL: auth/'s log shows claude.ai's own document as the `client_id`,
  `scope=starreach:play` and the resource URL, then the confirmation page, a token, and a game
  started. Claude Code, added with only the URL, then signed in the same way: the log shows its
  own document as the `client_id` and a loopback callback on a port it chose.

### D-40 A home page at `/` and the viewer at `/viewer` — *Decided; the `/viewer` path Proposed*
- **Choice:** `public/index.html` is a short home page for new players (what the game is, how to
  connect, a loose field guide, a prominent line to ask the computer what it can do). The viewer
  moves to `public/viewer.html`. `viewer_url` is `<origin>/viewer?view=<view_id>`.
- **Alternatives:** `/view.html` or `/viewer.html` as the link (Cloudflare redirects `.html`
  paths to the extensionless one, an extra hop on every link); keeping the viewer at `/` and
  putting the home page elsewhere (a new player lands on a viewer that says "no ship on this
  channel"); forwarding a `view` query parameter from the home page to the viewer (declined: links from
  earlier games break, which the designer accepted).
- **Why:** Designer decisions: the viewer gets its own page and `/` becomes the home page. [P] Cloudflare static assets use the default
  `html_handling` (auto-trailing-slash), which serves `viewer.html` at `/viewer`, so building the
  link as `/viewer` avoids the redirect. The Node adapter serves its pages from an explicit list at the
  same two paths, so both adapters agree. A viewer with no game links back to the home page. The page keeps game numbers out, so tuning doesn't make it stale.
- **Evidence:** Page tests in the Node adapter (home content, viewer paths); U-12. `just cc-smoke`
  fetches `/` and the path of the `viewer_url` that `new_game` reports, on either adapter.

### D-39 Raxxon damage: 2000 at 1 cell, 1800 at 2, then exponential decay to 100 at 9 and beyond — *Decided*
- **Choice:** Before the D-37 factor, an enemy shot deals `ENEMY_FIRE_BASE` at 1 cell, easing
  linearly to `ENEMY_FIRE_NEAR` at `ENEMY_FIRE_NEAR_RANGE`, then decaying exponentially (the same
  ratio per cell) to `ENEMY_FIRE_FAR` at `ENEMY_FIRE_FAR_RANGE`, and holding there beyond it. The
  decay shares its formula with the blast kill chance (D-36).
- **Alternatives:** a power law `ENEMY_FIRE_BASE × (1/d)^1.57` (the old rule: most of the drop
  came inside range 3, so a shot at 3 did a sixth of a point-blank one and mid-range fire barely
  mattered); 1800 at range 3 (fire at 3 became devastating: about 3 average hits destroy the ship);
  a flat `ENEMY_FIRE_NEAR` out to the near range, a strict mirror of blasts (point-blank no worse); a lower near value with the same shape.
- **Why:** Designer decision: raxxon fire uses the same profile as the blast kill chance, effective
  to 2 and falling off after it, so range 3 is still nasty but not devastating, and the player's
  sure blasts out to 4 (D-36) are the edge in a busy sector. Point-blank stays the worst place to be. Mid-range fire is now a real threat, so
  every enemy turn in a sector counts (F-danger), and a floor of `ENEMY_FIRE_FAR` keeps a distant
  enemy from being harmless.
- **Evidence:** Modeled by: `just cc-model-balance 2000` (formula, unverified in play) — at the
  middle of the D-37 band, 2000 at range 1, 1800 at 2, 1191 at 3, 788 at 4, 522 at 5, 345 at 6,
  228 at 7, 151 at 8, 100 at 9 and beyond. Against 3000 shields plus 2000 hull, about 4.2 average
  hits at range 3 or 6.3 at range 4 destroy the ship. Tested by R-14.

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
- **Evidence:** Arithmetic: the cheapest warp costs 4160 (D-5) and
  `STARBASE_EMERGENCY_ENERGY` is 1000, so the transfer never pays for a warp; it pays for
  subwarp steps, torpedoes and a blast at range 1. A ship in a starbase's sector with less
  than the warp to the next visible starbase is raised to that floor after every action
  until it docks. Star Central never has enemies, so docking is always available there.

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

### D-27 Shields recharge from energy, 10 shield points per energy — *Decided; `SHIELD_REPLENISH` and `SHIELD_POINTS_PER_ENERGY` tunable*
- **Alternatives:** restore a fixed amount for free; a price of 1 energy per shield point.
- **Why:** It ties shields to the energy economy (G-4): fighting drains the tank twice. The
  price is 1 energy per `SHIELD_POINTS_PER_ENERGY` = 10 shield points [D]: a 500-point
  replenish costs 50 energy and a refill from empty 300, small next to a blast (1000 and up,
  D-9) and a warp (4160 and up, D-5). At 1 energy per point a refill cost 3000, as much as the
  dearest blast, and shields competed with the weapons for the tank; at this price the energy
  goes to blasts and warps over a long game. The cost rounds up to a whole energy, so a
  recharge is never free [D]. One rule serves the in-sector event, limited to
  `SHIELD_REPLENISH` per `EVENT_INTERVAL`, and the warp, which recharges to full (D-5).
- **Evidence:** Arithmetic for the prices. Modeled by: `just cc-model-balance 2000` for the
  effect on battles and on one tank (D-5).

### D-11 Ship stats — *Decided, tuned by none yet*
- **Why:** Starting values. Energy is generous next to costs (see D-9). Unmeasured.

### D-12 The clock counts whole starticks, 400 to a stardate; a stardate is a day and shows as `ddd.dddd.dd.d` — *Decided*
- **Alternatives:** a fractional (floating-point) stardate; a whole-number stardate as the unit,
  shown as an 8-digit `99-9999-99` with no decimals; 1000 starticks to a stardate, one per
  shown decimal; a starting stardate drawn from the game's seed; migrating stored games.
- **Why:** Whole ticks [D]: the stardate events rule compares elapsed time with
  `EVENT_INTERVAL`, and sums of fractional times drift, so a round could fire an action late or
  early. Whole numbers add exactly, and "every time is a whole number of starticks" is an
  invariant a test can hold. 400 to a stardate [D]: a stardate is a day, so a startick is 3.6
  minutes, a typical battle of 5 starticks is 18 minutes, and the in-sector times are small whole
  numbers. It also divides evenly: one startick is 0.0025 stardates, so three
  truncated decimals show every startick as a change. The display [D] is flavor (F-command):
  seven whole digits split three and four, then the decimals split two and one. A duration is
  written the same way without padding, so the crew reads both by one rule, and the tool
  descriptions and instructions tell the LLM a stardate is a day so it can say minutes, hours
  or days. The start [D] is the real date, the Unix time in days plus `STARDATE_EPOCH_OFFSET`,
  so a game begun in late 2026 opens near stardate 1020770 (`102.0770`) and later games carry
  later stardates. The core stays a pure function: the adapter reads the clock and the app
  layer passes it to `new_game` beside the seed, and tests pin it. No migration [D]: nobody has
  a production game going, so a stored game with the old clock fields is unreadable and is
  answered as not found.
- **Evidence:** R-17 (the display at whole, boundary and remainder values, truncation, the start
  from Unix time), R-11 (the interval fires on the same actions), R-25 and R-21 (an unreadable
  stored game is not found, for the player and for a viewer).

---

## Open questions

Each question lists its options and Claude's recommendation.

- **Q-19 Do players in one game see one view?** A frame is per game today. Multiplayer could
  share what any ship uncovers, or give each player their own fog, which would make the view
  per player. Deferred by the designer to multiplayer design, where what is shared is a central
  question. The frame and `view` are the places that would change.
---

## Deliberately left out
- Multiplayer (D-18).
- Persistence across restarts (non-goal in ONTOLOGY's Purpose).
- Enemy health and enemy types (D-19). Revisit if Enemy Identity becomes a driver.

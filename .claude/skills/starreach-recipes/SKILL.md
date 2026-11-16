---
name: starreach-recipes
description: Project-local just recipes for Starreach (build WASM, serve locally, print the local server's telemetry, run the Cloudflare adapter in the background, set up the D1 telemetry database locally or in production, smoke-test a server, deploy, tail or undeploy production, run Rust/app tests, model balance numbers). Use before running tests, after deploying or changing the server (smoke-test it), or before regenerating RATIONALE evidence in this repo.
---

# Starreach recipes

Invoke these recipes; don't call the scripts directly.

**When to smoke-test.** The `cc-` recipes are yours to run without being asked. Run
`just cc-smoke` yourself:
- after every `just cf-deploy`, against https://starreach.yuwakisa.com;
- after changing the adapters, the app layer's HTTP or MCP handling, or the viewer socket:
  `just cf-up`, then `just cc-smoke http://localhost:8787`, then `just cf-down`.

Report a failure rather than deploying past it.

## Deploying

Only with the user's go-ahead, and in this order. Steps 1 to 3 are needed once, the first time
the Worker is deployed with its telemetry database (D-53); after that a deploy is steps 4 to 6.

1. `just cf-d1-production`: creates the D1 database `starreach-telemetry` on the Cloudflare
   account and prints its `database_id`.
2. In `adapters/cloudflare/wrangler.jsonc`, under `env.production.d1_databases`, replace
   `PUT-THE-DATABASE-ID-HERE` with that id. Leave the top-level `d1_databases` block as it is:
   its made-up id is for the local database.
3. `just cf-d1-production` again: with the id filled in, it applies
   `adapters/cloudflare/telemetry_schema.sql` to the production database. Safe to repeat.
4. `just cf-deploy --dry-run`, then `just cf-deploy`. It refuses to deploy while the placeholder
   is still in the config.
5. `just cc-smoke https://starreach.yuwakisa.com`.
6. Commit `wrangler.jsonc` with the id in it. The id is not a secret.

The schema file's statements are `CREATE … IF NOT EXISTS`, so applying it again never changes a
table that exists. There is no migration history: after changing a table in the schema file,
alter the local and production databases by hand, and tell the user.

| Recipe | What it does |
|---|---|
| `just setup` | Installs the wasm32 target, wasm-bindgen CLI 0.2.130, the npm workspaces and headless Chromium |
| `just cc-setup` | After a container rebuild: runs `tools/container_tools.py`, which fetches a C linker (Zig, wired in through `~/.cargo/config.toml`) and Chromium's system libraries into `~/.local/share/starreach-tools` when they're missing, then `just setup`. No root needed |
| `just serve` | Builds the WASM core and serves the home page, the viewer page and sockets, MCP at `/mcp` and `/health` on `HTTP_HOST:HTTP_PORT` (127.0.0.1:8572, set at the top of the justfile). Browsers get `VIEW_ORIGIN`; override both in a container: `just HTTP_HOST=0.0.0.0 VIEW_ORIGIN=http://localhost:8572 serve` |
| `just stdio` | The same as `serve`, plus MCP over stdio. It exits when stdin closes |
| `just up` | `serve` in the background (logic in `tools/server.sh`): builds the WASM core, or without a Rust toolchain uses the last build in `app/src/wasm`, then starts the Node server in its own process group (`setsid`), writes the PGID to `.run/serve.pid` and output to `.run/serve.log`, and waits for the server's "Starreach on" line. Says so and does nothing if already running. In a container: `just HTTP_HOST=0.0.0.0 VIEW_ORIGIN=http://localhost:8572 up` |
| `just down` | Stops what `up` started: TERM to the process group, KILL after 4 s, removes the pidfile |
| `just logs` | Follows `up`'s log |
| `just telemetry` | Prints the telemetry the local server holds (`just up`, `serve` or `stdio`), fetched with curl from `GET /telemetry` on `HTTP_HOST:HTTP_PORT` (logic in `tools/server.sh`): one JSON object per line, each game record as `{"game": …}`, then each event record (one per tool call) as `{"event": …}`. In memory only, so a restart empties it. Exits 1 with "no local server is running … start one with: just up" when nothing listens there. Node adapter only: the Cloudflare adapter has no such route. e.g. `just telemetry \| grep '"event"'` |
| `just add` / `just remove` | Registers or removes the deployed Starreach as the Claude Code MCP server `starreach` (local scope) |
| `just add-local` / `just remove-local` | The same for a locally running server (`just up` or `just serve`) as `starreach-local`, at `HTTP_HOST:HTTP_PORT` |
| `just cf-dev [wrangler dev args]` | Builds the WASM core and runs the Cloudflare adapter under `wrangler dev` (wrangler 4.90.0, from npm): the home page, the viewer page and sockets, MCP at `/mcp` and `/health` on http://localhost:8787, games in local Durable Objects and telemetry in a local D1 database under `adapters/cloudflare/.wrangler/`. Runs `cf-d1-local` first. In a container: `just cf-dev --ip 0.0.0.0` |
| `just cf-up [wrangler dev args]` | `cf-dev` in the background: builds the WASM core, runs `cf-d1-local`, starts `wrangler dev` in its own process group (`setsid`), writes the PGID to `adapters/cloudflare/.wrangler/pids/cf.pid` and output to `adapters/cloudflare/.wrangler/logs/cf.log`, and waits for wrangler's "Ready on" line. Says so and does nothing if already running. Same local Durable Objects as `cf-dev`. In a container: `just cf-up --ip 0.0.0.0` |
| `just cf-down` | Stops what `cf-up` started: TERM to the process group, KILL after 4 s, removes the pidfile. Also reaps a `wrangler dev --config adapters/cloudflare/wrangler.jsonc` whose pidfile is gone (pgrep sweep) |
| `just cf-logs` | Follows `cf-up`'s log (`tail -F`) |
| `just cf-d1-local` | Gives the local telemetry database its tables (logic in `tools/telemetry_db.sh`): `wrangler d1 execute starreach-telemetry --local --file adapters/cloudflare/telemetry_schema.sql`. The database is local files under `adapters/cloudflare/.wrangler/state/`, made on first use; nothing on the Cloudflare account is touched. Safe to run again; `cf-dev` and `cf-up` run it first. To look at what a local game recorded: `npx wrangler d1 execute starreach-telemetry --local --config adapters/cloudflare/wrangler.jsonc --command "SELECT tool, accepted, energy FROM events ORDER BY unix_seconds"` (always `--local`) |
| `just cf-d1-production` | TOUCHES THE PRODUCTION ACCOUNT; never run it without the user's go-ahead. Run it twice (see Deploying). While `wrangler.jsonc` holds `PUT-THE-DATABASE-ID-HERE` it runs `wrangler d1 create starreach-telemetry --no-update-config` and says where to put the printed id; once the id is in, it runs `wrangler d1 execute starreach-telemetry --remote --env production --file adapters/cloudflare/telemetry_schema.sql` |
| `just cc-smoke <base_url>` | Runs `tools/smoke.ts` against a running server, e.g. `just cc-smoke http://localhost:8787` (after `cf-up`) or `just cc-smoke https://starreach.yuwakisa.com`: `/health` and `/` are 200, MCP `initialize` and `new_game` return a game_id and viewer_url, the viewer_url's path is 200 HTML, a viewer socket on `/live/<view_id>` gets a frame on connecting, `long_range_scan` succeeds, and the socket gets another frame. Prints `ok` per step; exits 1 with `smoke FAILED ...` on any failure. Leaves one game on the server. Works against `just serve` too (http://127.0.0.1:8572) |
| `just cf-whoami` | Shows which Cloudflare account wrangler is logged in to: the shared OAuth login also used by /work/yuwakisacloud (`just login` there to log in) |
| `just cf-deploy [--dry-run]` | Builds the WASM core and runs `wrangler deploy --env production` for the Cloudflare adapter, to the `starreach.yuwakisa.com` custom domain. `--dry-run` checks the bundle and bindings without deploying. A real deploy is refused, before wrangler runs, while `wrangler.jsonc` still holds `PUT-THE-DATABASE-ID-HERE` (see Deploying). Only deploy with the user's go-ahead |
| `just cf-tail` | Streams the production Worker's live logs (`wrangler tail --env production`) |
| `just cf-undeploy` | KILL SWITCH: `wrangler delete --env production` deletes the production Worker, taking starreach.yuwakisa.com down, and its Durable Objects with it, so every deployed game is lost. Wrangler asks for confirmation. Never run it without the user's go-ahead |
| `just cc-build-wasm` | Builds the core to WASM and generates bindings into `app/src/wasm/` (gitignored) |
| `just cc-test-all` | Runs `cc-test-core`, `cc-test-app`, `cc-test-node`, `cc-test-cloudflare`, `cc-test-page` and `cc-typecheck` |
| `just cc-test-core [cargo test args]` | Runs the Rust core's rule tests (`core/tests/R-n/`) and the CRITERIA coverage test (e.g. `just cc-test-core --test rules r_9`) |
| `just cc-test-app` | Runs the app tests (`app/test/**/*.test.ts`, Node's test runner) against the WASM core |
| `just cc-test-node` | Runs the Node adapter's tests (`adapters/node/test/**/*.test.ts`): real sockets on a free port, the stdio process, and `just telemetry`'s script (needs curl) |
| `just cc-test-cloudflare` | Runs the Cloudflare adapter's tests (`adapters/cloudflare/test/**/*.test.ts`) inside workerd, under vitest with `@cloudflare/vitest-pool-workers`: the Durable Object store, the Worker's HTTP routes, the viewer sockets (R-21, R-27), the player object's lifetime totals (R-39), the achievements in a viewer's frames (R-43), the absent `/telemetry` route (R-51) and telemetry in D1 (R-50, R-47, R-49). `test/helpers/setup.ts` applies `telemetry_schema.sql` to workerd's local D1 before each file. The Worker writes telemetry after its reply, so a test reads rows through the waiting helpers in `test/helpers/telemetry_db.ts`. Its files share one worker and storage (`maxWorkers: 1`, `isolate: false`), so each test makes its own game and names its own player |
| `just cc-test-page` | Drives the viewer page and the home page in headless Chromium against the real server (`adapters/node/test-browser/`). Screenshots go to `adapters/node/test-browser/out/` |
| `just cc-typecheck` | Runs `tsc --noEmit` over `app/` and `adapters/node/`, then over `adapters/cloudflare/` with its own `tsconfig.json` (Workers types instead of Node's) |
| `just cc-dev-token` | Mints a local auth/ access token for Starreach's local client (`D21zauaGSjnD3U77`; production's is `cZpqWEBNv9M7xQRl`) as auth/'s seeded dev user, through the PKCE code flow. Needs yuwakisacloud's auth/ on :8788 (`cd /work/yuwakisacloud/auth && just migrate-local && just dev-up`). The request names the local MCP URL as its `resource`, so the token's audience is that URL; `just cc-dev-token ''` gives a token whose audience is the client id. Prints the bare token; `SMOKE_TOKEN=$(just cc-dev-token) just cc-smoke http://localhost:8787` (after `cf-up`) also plays through `/mcp` signed in |
| `just cc-screenshot <url> <out> <width> <height>` | Runs `tools/screenshot.ts`: headless Chromium opens the URL, waits for a viewer to go live (when the URL has `view=`), and saves a `.png` or `.jpg`. A viewer URL ending `#achievements` is pictured with the achievements panel open. The home page's `public/images/viewer.jpg` is a live game at 1100×575 |
| `just cc-model-balance <galaxies>` | Runs `core/examples/model_balance/` (run `balance`): prints the modeled generation, combat, battle, warp and energy-reach numbers (energy to the nearest starbase, enemy sectors cleared on one tank, how often a tank ends stranded) cited as Evidence in `docs/RATIONALE.md` (RATIONALE cites 2000 galaxies) |
| `just cc-model-games [games]` | Runs `core/examples/model_balance/` (run `games`): a scripted captain plays whole seeded games (1000 unless told otherwise, about 2 seconds). Prints how the games ended, their length, and per counter the mean, 10th, 25th, 50th and 90th percentiles and the share of games with at least 1, then the `scale` and `goal_ceiling` the D-43 rule gives beside the ones in `core/src/counters.rs`, marking a row that differs; then, per counter, the share of games it is a goal in and the share the captain meets, overall and by amount, and the share of games meeting 0 to 3 of their goals (D-47's Evidence). Rerun after a balance change and update the table and the Evidence of D-43 and D-47 (RATIONALE cites 1000 games) |

The TypeScript runs directly under Node 26 (type stripping), so it has no build step. Imports
use `.ts` extensions. The Cloudflare adapter is the exception: wrangler bundles it, and its
tests use vitest's `expect`, not `node:assert`. Its packages are pinned to exact versions that
go together (wrangler 4.90.0, `@cloudflare/vitest-pool-workers` 0.16.3, workers-types
4.20260507.1), and npm runs with `ignore-scripts=true`. Never run `wrangler deploy`,
`wrangler login` or any `wrangler d1` command without `--local` without the user.

A new core rule test goes in `core/tests/R-n/<what_it_checks>.rs` and gets a `#[path]` module
line in `core/tests/rules.rs`. An app rule test goes in `app/test/R-n/<what>.test.ts`, and a Node adapter one in
`adapters/node/test/R-n/<what>.test.ts` (or `adapters/cloudflare/test/R-n/`). Either way, its CRITERIA row becomes `automated`. The coverage test fails if any of these is missing.

Starreach is a galaxy search-and-battle game you play by talking to an LLM. The LLM plays the ship's crew and acts on the game through MCP tools, while a read-only browser page shows the current sector, the galaxy map and ship status live.

The game is in three layers (D-21):

- `core/`: the rules, in Rust compiled to WASM.
- `app/`: the TypeScript MCP tools and HTTP routes, which work on any platform.
- `adapters/node/`: runs the app on Node, with MCP over stdio or HTTP, the home page, the viewer page and its sockets, and games and player totals kept in memory.
- `adapters/cloudflare/`: runs the app on Cloudflare as a Worker, with MCP over HTTP, each game and its viewer sockets in one Durable Object, each player's lifetime totals in another, and the home page and viewer page as static assets. It is deployed at https://starreach.yuwakisa.com (MCP at `/mcp`), where MCP needs sign-in through yuwakisacloud's auth/ ("Sign in with Bluesky"); the Node adapter has no sign-in.

## Design docs

The game design lives in `docs/`:

- `docs/ONTOLOGY.md`: what exists, the rules, the numbers, and the MCP/HTTP interface (the implementation reference)
- `docs/CRITERIA.md`: how each rule is checked
- `docs/RATIONALE.md`: why each choice was made, and open questions
- `docs/DYNAMICS.md`: why it's fun
- `docs/ARCHITECTURE_LOG.md`: dated history of design changes
- `YUWAKISA.md`: recommendation for deploying on yuwakisacloud (D-20)

## Setup

Needs Rust (stable), Node 26 and `just`. Then run:

    just setup        # wasm32 target, wasm-bindgen CLI, npm install
    just cc-test-all  # Rust rule tests, app, adapter and browser tests, typecheck

## Run

    just serve        # the viewer at http://127.0.0.1:8572/, MCP at /mcp, health at /health
    just stdio        # the same, plus MCP over stdio

    just cf-dev       # the Cloudflare adapter under wrangler dev: the viewer at http://localhost:8787/, MCP at /mcp
    just cf-up        # cf-dev in the background; log in adapters/cloudflare/.wrangler/logs/cf.log
    just cf-logs      # follow that log
    just cf-down      # stop it
    just cf-deploy    # deploy to https://starreach.yuwakisa.com (add --dry-run to check first)
    just cf-tail      # stream the production Worker's live logs
    just cf-undeploy  # kill switch: delete the production Worker AND every deployed game

    just cc-smoke http://localhost:8787               # check a running server: /health, sign-in, a game over /mcp, a viewer socket
    just cc-smoke https://starreach.yuwakisa.com      # the same against production (game checks only with SMOKE_TOKEN)
    SMOKE_TOKEN=$(just cc-dev-token) just cc-smoke http://localhost:8787   # signed in against a local auth/

Each recipe that runs a server builds the WASM core first. `cf-dev` keeps its games in local Durable Objects under `adapters/cloudflare/.wrangler/`, so they outlast a restart.

## Sign in to the deployed server

`/mcp` on Cloudflare is an OAuth resource server for auth/ (D-41). An MCP client calling it without
a token gets a 401 pointing at `/.well-known/oauth-protected-resource/mcp`, signs the player in at
auth/ and comes back with a bearer token. The MCP client identifies itself to auth/ with its own
Client ID Metadata Document, so the URL is all a player needs:

- claude.ai and Claude Desktop: add a custom connector with `https://starreach.yuwakisa.com/mcp`
  and connect it.
- Claude Code: `claude mcp add --transport http starreach https://starreach.yuwakisa.com/mcp`, then `/mcp` to sign in.

The player signs in with Bluesky and, the first time, allows the client on auth/'s confirmation
page. A client that cannot use a metadata document can use auth/'s pre-registered public client
for Starreach instead: `cZpqWEBNv9M7xQRl` in production, with no secret and, for a local callback,
port 8574.

Locally, `just cf-up` signs in against auth/ running under yuwakisacloud's `just dev-up`, with
the local client `D21zauaGSjnD3U77` from auth/'s dev seed; `just cc-dev-token` mints a token.

## Run in Claude Desktop

Build once with `just cc-build-wasm`, then point Claude Desktop at the Node adapter:

  "mcpServers": {
    "starreach": {
      "command": "node",
      "args": ["/work/starreach/adapters/node/src/main.ts", "stdio",
               "--host", "127.0.0.1", "--port", "8572", "--origin", "http://127.0.0.1:8572"]
    }
  }

Start with the `new_game` tool and pass its `game_id` to every other tool. The server's instructions, sent when a client connects, set the crew's voice.

## Stardates

The game clock counts whole starticks, 400 to a stardate, and a stardate is a day (D-12). A game starts at the real date: the Unix time in days plus 1,000,000. The stardate is shown to three decimals as `ddd.dddd.dd.d`, so `102.0773.36.5` is stardate 1020773.365. An action's `report.time` is how long it took, written the same way: `0.00.2` is one startick (3.6 minutes) and `1.04.0` is 1.04 stardates.

Games stored before a change to the game's fields are not migrated: they answer "Game not found".

## Goals

Every game sets three goals, each an amount of a different counter to reach within that game, such as 50 enemies destroyed, 5 docks at a starbase or 10 long range scans (D-47). They are chosen from the game's seed, never on a negative counter such as damage taken, and sized as a random rung (1, 2, 5, 10, 20, 50…) at or below what most modeled games reach. `new_game` reports them in `report.goals`, the crew presents them when the game starts, and every result's `state.goals` shows each goal's count so far, its amount and whether it is met. When a command meets one, a message from Star Central arrives in that command's events (D-48). There is no other reward. Play toward a goal also counts toward the lifetime totals below, and the two are announced separately.

## Achievements

The core counts what happens in a game (enemies destroyed, docks, shield damage taken and so on), and every count is added to the lifetime totals of the player who issued the command, across all their games (D-44). Each counter has a ladder of rungs, its scale × 1, 2, 5, 10, 20, 50…; when a total reaches a rung, a message from Star Central arrives in that command's events and the crew relays it. The message is one of 20 wordings, picked at random outside the game's own random stream (D-46). The negative counters have achievements too, with drier wordings. There is no tool that lists achievements: the main viewer shows them (D-49).

On Cloudflare the totals belong to the signed-in player and are kept in a Durable Object per player (D-45). The Node adapter has no sign-in, so its totals belong to one local player and last until the process exits.

## The main viewer

`new_game` reports a `viewer_url`, and the crew gives you the link. It carries a hash of the game_id, so sharing it shares the view and not the controls. Open it (at `/viewer`) for a live, read-only view of the current sector, the galaxy map and ship status. It also shows the game's three goals with their progress, and its Achievements button opens a scrolling panel of lifetime totals: for each counter the total, the last rung reached and the next, nearest the next rung first. They are the achievements of the player who started the game, and the page never receives that player's id (D-49). Only one server can hold the port. A stdio server that finds another Starreach server there forwards to it and shares its games, and those games end when the server holding the port exits.

In a container, bind every interface, publish the port, and tell the server where browsers reach it: `--host 0.0.0.0 --port 8572 --origin http://localhost:8572`.

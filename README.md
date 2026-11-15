Starreach is a galaxy search-and-battle game you play by talking to an LLM. The LLM plays the ship's crew and acts on the game through MCP tools, while a read-only browser page shows the current sector, the galaxy map and ship status live.

The game is in three layers (D-21):

- `core/`: the rules, in Rust compiled to WASM.
- `app/`: the TypeScript MCP tools and HTTP routes, which work on any platform.
- `adapters/node/`: runs the app on Node, with MCP over stdio or HTTP, the home page, the viewer page and its sockets, and games kept in memory.
- `adapters/cloudflare/`: runs the app on Cloudflare as a Worker, with MCP over HTTP, each game and its viewer sockets in one Durable Object, and the home page and viewer page as static assets. It is deployed at https://starreach.yuwakisa.com (MCP at `/mcp`), where MCP needs sign-in through yuwakisacloud's auth/ ("Sign in with Bluesky"); the Node adapter has no sign-in.

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
auth/ and comes back with a bearer token. auth/ has a pre-registered public client for Starreach,
`cZpqWEBNv9M7xQRl` in production:

- claude.ai and Claude Desktop: add a custom connector with `https://starreach.yuwakisa.com/mcp`,
  choose "Use your own OAuth client" and enter that client ID, with no secret.
- Claude Code: `claude mcp add --transport http --client-id cZpqWEBNv9M7xQRl --callback-port 8574 starreach https://starreach.yuwakisa.com/mcp`, then `/mcp` to sign in.

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

## The main viewer

`new_game` reports a `viewer_url`, and the crew gives you the link. It carries a hash of the game_id, so sharing it shares the view and not the controls. Open it (at `/viewer`) for a live, read-only view of the current sector, the galaxy map and ship status. Only one server can hold the port. A stdio server that finds another Starreach server there forwards to it and shares its games, and those games end when the server holding the port exits.

In a container, bind every interface, publish the port, and tell the server where browsers reach it: `--host 0.0.0.0 --port 8572 --origin http://localhost:8572`.

Starreach is a galaxy search-and-battle game you play by talking to an LLM. The LLM plays the ship's crew and acts on the game through MCP tools, while a read-only browser page shows the galaxy map and ship status live.

The game is in three layers (D-21):

- `core/`: the rules, in Rust compiled to WASM.
- `app/`: the TypeScript MCP tools and HTTP routes, which work on any platform.
- `adapters/node/`: runs the app on Node, with MCP over stdio or HTTP, the viewer page and its sockets, and games kept in memory.

A Cloudflare adapter comes next.

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

Both recipes build the WASM core first.

## Run in Claude Desktop

Build once with `just cc-build-wasm`, then point Claude Desktop at the Node adapter:

  "mcpServers": {
    "starreach": {
      "command": "node",
      "args": ["/work/starreach/adapters/node/src/main.ts", "stdio",
               "--host", "127.0.0.1", "--port", "8572", "--origin", "http://127.0.0.1:8572"]
    }
  }

Start with the `new_game` tool and pass its `game_id` to every other tool. The `instructions` prompt sets the crew's voice.

## The main viewer

`new_game` reports a `view_url`, and the crew gives you the link. Open it for a live, read-only galaxy map and ship status. Only one server can hold the port. A stdio server that finds another Starreach server there forwards to it and shares its games, and those games end when the server holding the port exits.

In a container, bind every interface, publish the port, and tell the server where browsers reach it: `--host 0.0.0.0 --port 8572 --origin http://localhost:8572`.

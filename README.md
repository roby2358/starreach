Starreach is a galaxy search-and-battle game you play by talking to an LLM. The LLM plays the ship's crew and acts on the game through MCP tools.

The game is in three layers (D-21):

- `core/`: the rules, in Rust compiled to WASM.
- `app/`: the TypeScript MCP tools and HTTP routes, which work on any platform.
- `adapters/node/`: runs the app on Node, over stdio or HTTP, with games kept in memory.

A Cloudflare adapter comes next. The old Python server in `src/` stays until the new layers play end to end.

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
    just cc-test-all  # Rust rule tests, app tests, typecheck

## Run

    just serve        # MCP at http://127.0.0.1:8000/mcp, health at /health
    just stdio        # MCP over stdio

Both recipes build the WASM core first.

## Run in Claude Desktop

Build once with `just cc-build-wasm`, then point Claude Desktop at the Node adapter:

  "mcpServers": {
    "starreach": {
      "command": "node",
      "args": ["/work/starreach/adapters/node/src/main.ts", "stdio"]
    }
  }

Start with the `new_game` tool and pass its `game_id` to every other tool. The `instructions` prompt sets the crew's voice.

## The old Python server

    python -m venv venv && venv/bin/pip install -r requirements.txt
    python starreach.py            # MCP over stdio, with HTTP on localhost:8000
    python starreach.py --stream   # streamable-HTTP MCP at localhost:8000/mcp

The browser view isn't served yet (RATIONALE Q-8).
